import { Hono } from "hono";
import { db } from "../db";

export const internal = new Hono();

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
