// Unit tests for the FCM push sender (#798): the fail-soft no-config no-op,
// service-account parsing (raw and base64), the OAuth2 JWT-grant exchange +
// access-token caching, per-token sends, the UNREGISTERED/404 token prune, and
// deliverPushJob's render+send. fetch, jose and Prisma are mocked — no live
// FCM/Google/DB.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    deviceToken: {
      deleteMany: vi.fn(),
    },
  },
}));
vi.mock("../db", () => ({ db: dbMock }));

// The private key never needs to be real — sign() just has to produce a
// string the (also mocked) token endpoint accepts.
vi.mock("jose", () => ({
  importPKCS8: vi.fn().mockResolvedValue({}),
  SignJWT: class {
    setProtectedHeader() {
      return this;
    }
    setIssuer() {
      return this;
    }
    setAudience() {
      return this;
    }
    setIssuedAt() {
      return this;
    }
    setExpirationTime() {
      return this;
    }
    async sign() {
      return "signed.assertion.jwt";
    }
  },
}));

import { deliverPushJob, pushEnabled, resetPushForTests, sendPush } from "./push";

const SERVICE_ACCOUNT = JSON.stringify({
  client_email: "push@example.iam.gserviceaccount.com",
  private_key: "-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----\n",
});

const fetchMock = vi.fn();

function tokenResponse() {
  return new Response(JSON.stringify({ access_token: "at_1", expires_in: 3600 }), {
    status: 200,
  });
}

function configure() {
  vi.stubEnv("FCM_PROJECT_ID", "demo-project");
  vi.stubEnv("FCM_SERVICE_ACCOUNT", SERVICE_ACCOUNT);
  resetPushForTests();
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  dbMock.deviceToken.deleteMany.mockResolvedValue({ count: 0 });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  resetPushForTests();
});

describe("configuration", () => {
  it("is disabled without env, and every push path no-ops", async () => {
    resetPushForTests();
    expect(pushEnabled()).toBe(false);
    await sendPush(["tok_1"], { title: "t", body: "b", link: "https://baas.lk/x" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts the service account raw or base64-encoded", () => {
    configure();
    expect(pushEnabled()).toBe(true);

    vi.stubEnv("FCM_SERVICE_ACCOUNT", Buffer.from(SERVICE_ACCOUNT).toString("base64"));
    resetPushForTests();
    expect(pushEnabled()).toBe(true);
  });

  it("disables push (no throw) when the service account JSON is unusable", () => {
    vi.stubEnv("FCM_PROJECT_ID", "demo-project");
    vi.stubEnv("FCM_SERVICE_ACCOUNT", "not json at all");
    resetPushForTests();
    expect(pushEnabled()).toBe(false);
  });
});

describe("sendPush", () => {
  it("exchanges a JWT grant for an access token, then POSTs one FCM send per device", async () => {
    configure();
    fetchMock
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValue(new Response("{}", { status: 200 }));

    await sendPush(["tok_1", "tok_2"], {
      title: "New inquiry",
      body: "Dilani sent you an inquiry.",
      link: "https://baas.lk/dashboard",
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const [tokenUrl, tokenInit] = fetchMock.mock.calls[0];
    expect(tokenUrl).toBe("https://oauth2.googleapis.com/token");
    expect(String(tokenInit.body)).toContain("jwt-bearer");
    expect(String(tokenInit.body)).toContain("signed.assertion.jwt");

    const [sendUrl, sendInit] = fetchMock.mock.calls[1];
    expect(sendUrl).toBe("https://fcm.googleapis.com/v1/projects/demo-project/messages:send");
    expect(sendInit.headers.authorization).toBe("Bearer at_1");
    expect(JSON.parse(sendInit.body)).toEqual({
      message: {
        token: "tok_1",
        notification: { title: "New inquiry", body: "Dilani sent you an inquiry." },
        data: { link: "https://baas.lk/dashboard" },
      },
    });
    expect(JSON.parse(fetchMock.mock.calls[2][1].body).message.token).toBe("tok_2");
  });

  it("caches the access token across batches until near expiry", async () => {
    configure();
    fetchMock
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValue(new Response("{}", { status: 200 }));

    await sendPush(["tok_1"], { title: "t", body: "b", link: "https://baas.lk/x" });
    await sendPush(["tok_2"], { title: "t", body: "b", link: "https://baas.lk/x" });

    // 1 token exchange + 2 sends — the second batch reused the cached token.
    const tokenCalls = fetchMock.mock.calls.filter(
      ([url]) => url === "https://oauth2.googleapis.com/token"
    );
    expect(tokenCalls).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("prunes a token FCM reports gone (404/UNREGISTERED) and keeps going", async () => {
    configure();
    fetchMock
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { details: [{ errorCode: "UNREGISTERED" }] } }), {
          status: 404,
        })
      )
      .mockResolvedValue(new Response("{}", { status: 200 }));

    await sendPush(["tok_dead", "tok_live"], { title: "t", body: "b", link: "https://baas.lk/x" });

    expect(dbMock.deviceToken.deleteMany).toHaveBeenCalledWith({
      where: { token: "tok_dead" },
    });
    // The live token was still sent after the prune.
    expect(JSON.parse(fetchMock.mock.calls[2][1].body).message.token).toBe("tok_live");
  });

  it("logs-and-continues on other send errors — no throw, no prune", async () => {
    configure();
    fetchMock
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(new Response("boom", { status: 500 }))
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValue(new Response("{}", { status: 200 }));

    await expect(
      sendPush(["tok_1", "tok_2", "tok_3"], { title: "t", body: "b", link: "https://baas.lk/x" })
    ).resolves.toBeUndefined();
    expect(dbMock.deviceToken.deleteMany).not.toHaveBeenCalled();
    expect(JSON.parse(fetchMock.mock.calls[3][1].body).message.token).toBe("tok_3");
  });

  it("skips the whole batch (no throw) when the token exchange fails", async () => {
    configure();
    fetchMock.mockResolvedValueOnce(new Response("denied", { status: 403 }));

    await expect(
      sendPush(["tok_1"], { title: "t", body: "b", link: "https://baas.lk/x" })
    ).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1); // only the token endpoint
  });
});

describe("deliverPushJob", () => {
  it("renders the type's localized text and sends to the job's tokens", async () => {
    configure();
    fetchMock
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValue(new Response("{}", { status: 200 }));

    await deliverPushJob({
      kind: "push",
      type: "NEW_REVIEW",
      tokens: ["tok_1"],
      locale: "en",
      payload: { reviewerName: "Dilani", rating: 5 },
      link: "https://baas.lk/provider/reviews",
    });

    const message = JSON.parse(fetchMock.mock.calls[1][1].body).message;
    expect(message.notification).toEqual({
      title: "New review",
      body: "Dilani left a 5-star review on your profile.",
    });
    expect(message.data).toEqual({ link: "https://baas.lk/provider/reviews" });
  });

  it("never throws, even when sending is impossible", async () => {
    resetPushForTests(); // unconfigured
    await expect(
      deliverPushJob({
        kind: "push",
        type: "NEW_INQUIRY",
        tokens: ["tok_1"],
        locale: "si",
        payload: { customerName: "Dilani" },
        link: "https://baas.lk/dashboard",
      })
    ).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
