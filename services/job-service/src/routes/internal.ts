import { Hono } from "hono";
import { db } from "../db";

export const internal = new Hono();

// POST /internal/users/:id/erase — account-deletion fan-out from
// identity-service. Deletes the user's JobRequests (responses cascade) and,
// when the caller passes the user's providerId, their JobResponses on other
// jobs (responses are keyed by provider id, which only the orchestrator can
// resolve). Idempotent: erasing an unknown user is a no-op 200. The
// orchestrator erases this service BEFORE the provider profile (#551), so a
// missing providerId here always means "no responses to erase" — never a
// retry whose Provider row was already deleted.
internal.post("/users/:id/erase", async (c) => {
  const userId = c.req.param("id");
  const body = (await c.req.json().catch(() => null)) as {
    providerId?: string;
  } | null;

  await db.jobRequest.deleteMany({ where: { customerId: userId } });
  if (body?.providerId) {
    await db.jobResponse.deleteMany({ where: { providerId: body.providerId } });
  }

  return c.json({ ok: true });
});

// GET /internal/jobs/count?category=&districts=&excludeCustomerId=
// Open-jobs count for the provider dashboard (provider-service). `districts`
// is the provider's comma-separated served set (#502) — jobs in ANY of them
// count, mirroring the board's scoping. The legacy single `district` param is
// still honored for a caller that predates #502.
internal.get("/jobs/count", async (c) => {
  const category = c.req.query("category");
  const districts = (c.req.query("districts") ?? c.req.query("district") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const excludeCustomerId = c.req.query("excludeCustomerId");

  const count = await db.jobRequest.count({
    where: {
      status: "OPEN",
      // Admin-hidden jobs (#376) are invisible to the board (jobs.ts), so the
      // dashboard badge must exclude them too (#647) — otherwise the count
      // overstates what a provider will actually see when they open the board.
      hiddenAt: null,
      ...(category ? { category } : {}),
      ...(districts.length ? { district: { in: districts } } : {}),
      ...(excludeCustomerId ? { NOT: { customerId: excludeCustomerId } } : {}),
    },
  });

  return c.json({ count });
});
