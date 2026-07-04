import { Hono } from "hono";
import { db } from "../db";

export const internal = new Hono();

// POST /internal/users/:id/erase — account-deletion fan-out from
// identity-service. Deletes the user's JobRequests (responses cascade) and,
// when the caller passes the user's providerId, their JobResponses on other
// jobs (responses are keyed by provider id, which only the orchestrator can
// resolve). Idempotent: erasing an unknown user is a no-op 200.
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

// GET /internal/jobs/count?category=&district=&excludeCustomerId=
// Open-jobs count for the provider dashboard (provider-service).
internal.get("/jobs/count", async (c) => {
  const category = c.req.query("category");
  const district = c.req.query("district");
  const excludeCustomerId = c.req.query("excludeCustomerId");

  const count = await db.jobRequest.count({
    where: {
      status: "OPEN",
      ...(category ? { category } : {}),
      ...(district ? { district } : {}),
      ...(excludeCustomerId ? { NOT: { customerId: excludeCustomerId } } : {}),
    },
  });

  return c.json({ count });
});
