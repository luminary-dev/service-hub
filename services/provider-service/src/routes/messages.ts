// Inquiry message threads (#13): follow-ups (job photos discussion, price
// negotiation) happen in-app instead of only by phone. Polling MVP — the
// client re-fetches with ?after=<ISO> while a thread is open; no push
// transport, upgradeable to SSE later without changing this contract.
import { Hono, type Context } from "hono";
import { z } from "zod";
import { db } from "../db";
import { getAuth } from "../lib/http";
import {
  lastReadField,
  otherParty,
  resolveThreadParty,
  type ThreadParty,
} from "../lib/thread-access";

export const messagesRoutes = new Hono();

const bodySchema = z.object({ body: z.string().trim().min(1).max(2000) });

async function loadThread(c: Context, id: string) {
  const auth = getAuth(c);
  const inquiry = await db.inquiry.findUnique({
    where: { id },
    include: { provider: { select: { id: true, userId: true, contactName: true } } },
  });
  if (!inquiry) return null;
  const party = resolveThreadParty(inquiry, auth);
  if (!party) return null;
  return { inquiry, party };
}

// Thread fetch. Marks the caller's side as read (their lastReadAt = now).
// ?after=<ISO> returns only newer messages so polling stays cheap; the full
// payload includes the thread header the UI needs (names, status, the
// original inquiry message shown as the first bubble).
messagesRoutes.get("/api/inquiries/:id/messages", async (c) => {
  const thread = await loadThread(c, c.req.param("id"));
  if (!thread) {
    // One shape for missing and forbidden — don't confirm inquiry ids.
    return c.json({ error: "Not found" }, 404);
  }
  const { inquiry, party } = thread;

  const afterRaw = c.req.query("after");
  const after = afterRaw ? new Date(afterRaw) : null;
  const messages = await db.inquiryMessage.findMany({
    where: {
      inquiryId: inquiry.id,
      ...(after && !Number.isNaN(after.getTime())
        ? { createdAt: { gt: after } }
        : {}),
    },
    orderBy: { createdAt: "asc" },
    take: 200,
  });

  await db.inquiry.update({
    where: { id: inquiry.id },
    data: { [lastReadField(party)]: new Date() },
  });

  return c.json({
    party,
    inquiry: {
      id: inquiry.id,
      status: inquiry.status,
      message: inquiry.message,
      createdAt: inquiry.createdAt,
      customerName: inquiry.name,
      provider: { id: inquiry.provider.id, name: inquiry.provider.contactName },
    },
    messages: messages.map((m) => ({
      id: m.id,
      sender: m.sender,
      body: m.body,
      createdAt: m.createdAt,
    })),
  });
});

messagesRoutes.post("/api/inquiries/:id/messages", async (c) => {
  const thread = await loadThread(c, c.req.param("id"));
  if (!thread) {
    return c.json({ error: "Not found" }, 404);
  }
  const { inquiry, party } = thread;

  const parsed = bodySchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "Invalid input" }, 400);
  }

  const message = await db.inquiryMessage.create({
    data: { inquiryId: inquiry.id, sender: party, body: parsed.data.body },
  });

  // A provider's first reply IS the response — same semantics as flipping
  // the status by hand, including the once-only respondedAt stamp.
  const statusUpdate =
    party === "PROVIDER" && inquiry.status === "NEW"
      ? {
          status: "RESPONDED",
          ...(inquiry.respondedAt ? {} : { respondedAt: new Date() }),
        }
      : {};
  await db.inquiry.update({
    where: { id: inquiry.id },
    data: { [lastReadField(party)]: new Date(), ...statusUpdate },
  });

  return c.json({
    message: {
      id: message.id,
      sender: message.sender,
      body: message.body,
      createdAt: message.createdAt,
    },
  });
});

// Unread counts for a set of inquiries, from the given party's perspective:
// messages from the OTHER side newer than this side's last read.
export async function unreadCounts(
  inquiries: {
    id: string;
    customerLastReadAt: Date | null;
    providerLastReadAt: Date | null;
  }[],
  party: ThreadParty
): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  if (inquiries.length === 0) return result;
  const rows = await db.inquiryMessage.groupBy({
    by: ["inquiryId"],
    where: {
      sender: otherParty(party),
      OR: inquiries.map((i) => {
        const lastRead =
          party === "CUSTOMER" ? i.customerLastReadAt : i.providerLastReadAt;
        return {
          inquiryId: i.id,
          ...(lastRead ? { createdAt: { gt: lastRead } } : {}),
        };
      }),
    },
    _count: { _all: true },
  });
  for (const r of rows) result[r.inquiryId] = r._count._all;
  return result;
}
