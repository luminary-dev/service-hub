// Customer account history (#46): the inquiries the signed-in user has sent,
// for the web app's /account page. Inquiries and providers are both local to
// this service, so a single query hydrates the provider fields the page needs
// (name/category to render, suspended so the web app skips linking to a
// hidden profile).
import { Hono } from "hono";
import { db } from "../db";
import { getAuth } from "../lib/http";

const MAX_ACCOUNT_INQUIRIES = 50;

export const accountRoutes = new Hono();

accountRoutes.get("/api/account/inquiries", async (c) => {
  const auth = getAuth(c);
  if (!auth) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  // Anonymous inquiries carry userId=null, so they never show up here.
  // (createdAt desc, id desc) keeps the order stable when timestamps collide
  // (seed data does).
  const rows = await db.inquiry.findMany({
    where: { userId: auth.userId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: MAX_ACCOUNT_INQUIRIES,
    include: {
      provider: {
        select: {
          id: true,
          contactName: true,
          category: true,
          suspended: true,
        },
      },
    },
  });

  return c.json({
    inquiries: rows.map((i) => ({
      id: i.id,
      message: i.message,
      status: i.status,
      createdAt: i.createdAt,
      respondedAt: i.respondedAt,
      provider: {
        id: i.provider.id,
        name: i.provider.contactName,
        category: i.provider.category,
        suspended: i.provider.suspended,
      },
    })),
  });
});
