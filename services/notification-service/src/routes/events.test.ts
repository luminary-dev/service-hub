// Route tests for the generic event-ingestion endpoint (RFC:
// stateful-notification-service): validation, preference gating, the inline
// in-app write + queued email split, dedupe, the 202-ack contract, and the
// account-erasure fan-out. Prisma and the queue are mocked — no live DB/Redis.
import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
    notification: {
      findMany: vi.fn(),
      createMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    notificationPreference: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));
vi.mock("../db", () => ({ db: dbMock }));

vi.mock("../lib/queue", async (importActual) => {
  const actual = await importActual<typeof import("../lib/queue")>();
  return { ...actual, enqueueEmailJobs: vi.fn().mockResolvedValue(undefined) };
});

import { app } from "../app";
import { enqueueEmailJobs } from "../lib/queue";

const SECRET = "dev-internal-secret";
const enqueueMock = vi.mocked(enqueueEmailJobs);

function postEvent(body: unknown, headers: Record<string, string> = {}) {
  return app.request("/internal/notifications/events", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-internal-secret": SECRET,
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

const EVENT = {
  type: "NEW_JOB_MATCH",
  recipients: [
    { userId: "user_a", email: "a@example.com", locale: "si" },
    { userId: "user_b", email: "b@example.com" },
    { userId: "user_c" }, // no email → in-app only
  ],
  payload: { jobTitle: "Fix a leaking tap", district: "Colombo" },
  link: "/jobs/job_1",
};

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.notification.findMany.mockResolvedValue([]);
  dbMock.notification.createMany.mockResolvedValue({ count: 0 });
  dbMock.notification.deleteMany.mockResolvedValue({ count: 0 });
  dbMock.$executeRaw.mockResolvedValue(0);
  dbMock.notificationPreference.findMany.mockResolvedValue([]);
  dbMock.notificationPreference.deleteMany.mockResolvedValue({ count: 0 });
});

describe("POST /internal/notifications/events — validation", () => {
  it("400s on an unknown type", async () => {
    const res = await postEvent({ ...EVENT, type: "SOMETHING_ELSE" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid input" });
  });

  it("400s on an empty or oversized recipient list (≤200)", async () => {
    expect((await postEvent({ ...EVENT, recipients: [] })).status).toBe(400);
    const many = Array.from({ length: 201 }, (_, i) => ({ userId: `u${i}` }));
    expect((await postEvent({ ...EVENT, recipients: many })).status).toBe(400);
  });

  it("400s on an invalid recipient email", async () => {
    const res = await postEvent({
      ...EVENT,
      recipients: [{ userId: "u1", email: "not-an-email" }],
    });
    expect(res.status).toBe(400);
  });

  it("400s when the payload does not match the type's schema", async () => {
    // NEW_JOB_MATCH requires jobTitle + district.
    expect((await postEvent({ ...EVENT, payload: { jobTitle: "x" } })).status).toBe(400);
    // Unknown keys are rejected (strict schemas).
    expect(
      (
        await postEvent({
          ...EVENT,
          payload: { jobTitle: "x", district: "y", extra: "z" },
        })
      ).status
    ).toBe(400);
    expect(dbMock.notification.createMany).not.toHaveBeenCalled();
  });

  it("400s on a non-relative link (absolute URLs are rebuilt per channel)", async () => {
    expect((await postEvent({ ...EVENT, link: "https://evil.example/x" })).status).toBe(400);
    expect((await postEvent({ ...EVENT, link: "//evil.example/x" })).status).toBe(400);
  });

  it("400s on a non-JSON body", async () => {
    const res = await app.request("/internal/notifications/events", {
      method: "POST",
      headers: { "content-type": "application/json", "x-internal-secret": SECRET },
      body: "not json",
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /internal/notifications/events — fan-out", () => {
  it("writes in-app rows inline, queues emails, and acks 202", async () => {
    const res = await postEvent(EVENT, { "x-origin": "https://baas.lk" });
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ ok: true, accepted: 3 });

    // In-app rows for every recipient (no overrides stored).
    expect(dbMock.notification.createMany).toHaveBeenCalledWith({
      data: [
        {
          userId: "user_a",
          type: "NEW_JOB_MATCH",
          payload: { jobTitle: "Fix a leaking tap", district: "Colombo" },
          link: "/jobs/job_1",
        },
        expect.objectContaining({ userId: "user_b" }),
        expect.objectContaining({ userId: "user_c" }),
      ],
    });

    // One email job per recipient WITH an email; absolute URL from x-origin;
    // locale coerced per recipient.
    expect(enqueueMock).toHaveBeenCalledTimes(1);
    expect(enqueueMock.mock.calls[0][0]).toEqual([
      {
        type: "NEW_JOB_MATCH",
        to: "a@example.com",
        locale: "si",
        payload: { jobTitle: "Fix a leaking tap", district: "Colombo" },
        link: "https://baas.lk/jobs/job_1",
        attempt: 0,
      },
      expect.objectContaining({ to: "b@example.com", locale: "en" }),
    ]);
  });

  it("sweeps retention in ONE batched query, not per recipient (#637)", async () => {
    const res = await postEvent(EVENT);
    expect(res.status).toBe(202);
    // The old loop fired findMany+deleteMany per recipient; retention now runs
    // as a single $executeRaw window-function delete for the whole in-app set.
    expect(dbMock.$executeRaw).toHaveBeenCalledTimes(1);
    expect(dbMock.notification.findMany).not.toHaveBeenCalled();
    expect(dbMock.notification.deleteMany).not.toHaveBeenCalled();
  });

  it("dedupes recipients by userId (first entry wins)", async () => {
    const res = await postEvent({
      ...EVENT,
      recipients: [
        { userId: "user_a", email: "a@example.com" },
        { userId: "user_a", email: "other@example.com" },
      ],
    });
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ ok: true, accepted: 1 });
    expect(dbMock.notification.createMany.mock.calls[0][0].data).toHaveLength(1);
    expect(enqueueMock.mock.calls[0][0]).toHaveLength(1);
    expect(enqueueMock.mock.calls[0][0][0].to).toBe("a@example.com");
  });

  it("honors stored preference overrides per channel", async () => {
    dbMock.notificationPreference.findMany.mockResolvedValue([
      { userId: "user_a", type: "NEW_JOB_MATCH", emailEnabled: false, inAppEnabled: true },
      { userId: "user_b", type: "NEW_JOB_MATCH", emailEnabled: true, inAppEnabled: false },
    ]);
    const res = await postEvent(EVENT);
    expect(res.status).toBe(202);

    // user_a muted email → in-app row only; user_b muted in-app → email only.
    const rows = dbMock.notification.createMany.mock.calls[0][0].data as {
      userId: string;
    }[];
    expect(rows.map((r) => r.userId)).toEqual(["user_a", "user_c"]);
    const jobs = enqueueMock.mock.calls[0][0];
    expect(jobs.map((j) => j.to)).toEqual(["b@example.com"]);
  });

  it("skips the createMany entirely when every recipient muted in-app", async () => {
    dbMock.notificationPreference.findMany.mockResolvedValue([
      { userId: "user_a", type: "NEW_JOB_MATCH", emailEnabled: true, inAppEnabled: false },
    ]);
    const res = await postEvent({
      ...EVENT,
      recipients: [{ userId: "user_a", email: "a@example.com" }],
    });
    expect(res.status).toBe(202);
    expect(dbMock.notification.createMany).not.toHaveBeenCalled();
    expect(enqueueMock.mock.calls[0][0]).toHaveLength(1);
  });

  it("REPORT_RESOLVED is in-app only — no email job even with an email + no override", async () => {
    const res = await postEvent({
      ...EVENT,
      type: "REPORT_RESOLVED",
      payload: { targetType: "REVIEW", status: "DISMISSED" },
      recipients: [{ userId: "user_a", email: "a@example.com" }],
    });
    expect(res.status).toBe(202);
    expect(dbMock.notification.createMany).toHaveBeenCalled();
    expect(enqueueMock.mock.calls[0][0]).toEqual([]);
  });

  it("accepts every catalog type with its documented payload", async () => {
    const cases: [string, object][] = [
      ["NEW_INQUIRY", { customerName: "Dilani" }],
      ["THREAD_REPLY", { senderName: "Nuwan" }],
      ["NEW_REVIEW", { reviewerName: "Dilani", rating: 5 }],
      ["REVIEW_RESPONSE", { providerName: "Nuwan" }],
      ["VERIFICATION_APPROVED", {}],
      ["VERIFICATION_REJECTED", { reason: "blurry scan" }],
      ["NEW_JOB_MATCH", { jobTitle: "Fix a tap", district: "Colombo" }],
      ["JOB_RESPONSE", { providerName: "Nuwan", jobTitle: "Fix a tap" }],
      ["SAVED_SEARCH_MATCH", { providerName: "Kumari", district: "Gampaha" }],
      ["REPORT_RESOLVED", { targetType: "REVIEW", status: "RESOLVED" }],
    ];
    for (const [type, payload] of cases) {
      const res = await postEvent({ ...EVENT, type, payload });
      expect(res.status, type).toBe(202);
    }
  });
});

describe("POST /internal/users/:id/erase", () => {
  it("deletes the user's notifications + preference overrides (idempotent)", async () => {
    const res = await app.request("/internal/users/user_a/erase", {
      method: "POST",
      headers: { "x-internal-secret": SECRET },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(dbMock.notification.deleteMany).toHaveBeenCalledWith({
      where: { userId: "user_a" },
    });
    expect(dbMock.notificationPreference.deleteMany).toHaveBeenCalledWith({
      where: { userId: "user_a" },
    });
  });
});
