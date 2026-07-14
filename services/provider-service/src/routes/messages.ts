// Inquiry message threads (#13): follow-ups (job photos discussion, price
// negotiation) happen in-app instead of only by phone. Polling MVP — the
// client re-fetches with ?after=<ISO> while a thread is open; no push
// transport, upgradeable to SSE later without changing this contract.
import { Hono, type Context } from "hono";
import { z } from "zod";
import { db } from "../db";
import { moderateContent } from "../lib/auto-report";
import { getAuth, getLocale, getOrigin } from "../lib/http";
import { emitNotification } from "../lib/notify";
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
    include: {
      provider: {
        select: { id: true, userId: true, contactName: true, contactEmail: true },
      },
    },
  });
  if (!inquiry) return null;
  const party = resolveThreadParty(inquiry, auth);
  if (!party) return null;
  return { inquiry, party };
}

// Thread fetch. Marks the caller's side as read up to the newest message this
// page actually returned (#638) — not now(), and only when the page was
// non-empty. ?after=<ISO> returns only newer messages so polling stays cheap;
// the full payload includes the thread header the UI needs (names, status, the
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
      // Messages removed by admin takedown (#376) are invisible to both
      // parties.
      deletedAt: null,
      ...(after && !Number.isNaN(after.getTime())
        ? { createdAt: { gt: after } }
        : {}),
    },
    orderBy: { createdAt: "asc" },
    take: 200,
  });

  // #638: only advance the read marker when this page returned messages, and
  // anchor it to the newest returned message's createdAt — never now(). The
  // old unconditional `now()` stamp wrote on every poll (amplification) and
  // opened a lost-unread race: a message landing between the SELECT above and
  // this update was marked read despite never being returned. Messages are
  // ordered ascending by createdAt, so the last element is the newest; a later
  // arrival keeps a strictly greater createdAt and stays correctly unread.
  if (messages.length > 0) {
    await db.inquiry.update({
      where: { id: inquiry.id },
      data: { [lastReadField(party)]: messages[messages.length - 1]!.createdAt },
    });
  }

  return c.json({
    party,
    inquiry: {
      id: inquiry.id,
      status: inquiry.status,
      message: inquiry.message,
      createdAt: inquiry.createdAt,
      customerName: inquiry.name,
      // Null once the provider is erased (#650) — the thread survives detached
      // and the client renders a "Deleted provider" counterpart.
      provider: inquiry.provider
        ? { id: inquiry.provider.id, name: inquiry.provider.contactName }
        : null,
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

  // A provider's first reply IS the response — same semantics as flipping
  // the status by hand, including the once-only respondedAt stamp.
  const statusUpdate =
    party === "PROVIDER" && inquiry.status === "NEW"
      ? {
          status: "RESPONDED",
          ...(inquiry.respondedAt ? {} : { respondedAt: new Date() }),
        }
      : {};

  // One transaction: the message insert and the thread-state update (read
  // marker + NEW→RESPONDED + once-only respondedAt) must both land or neither.
  // A partial write here corrupts unread counts and the public
  // average-response-time stat.
  const message = await db.$transaction(async (tx) => {
    const m = await tx.inquiryMessage.create({
      data: { inquiryId: inquiry.id, sender: party, body: parsed.data.body },
    });
    await tx.inquiry.update({
      where: { id: inquiry.id },
      data: { [lastReadField(party)]: new Date(), ...statusUpdate },
    });
    return m;
  });

  // Content filter (#375): AFTER the write on purpose — the message is
  // delivered as normal and a filter hit only queues a SYSTEM report (on the
  // thread's inquiry — the report's details carry the offending excerpt).
  await moderateContent("INQUIRY", inquiry.id, { message: parsed.data.body });

  // Tell the OTHER party there is a new reply (#393): in-app + email via the
  // notification event — best-effort, never fails the message. Anonymous
  // inquiries carry no customer account (userId null), so a provider reply to
  // one notifies nobody; the inquiry's optional email is the customer's
  // address, the provider's is the denormalized contactEmail.
  // When the provider is erased (#650) `inquiry.provider` is null; only the
  // CUSTOMER party can reach this path then (no one authenticates as the gone
  // provider), and there is no provider account left to notify → null.
  const recipient =
    party === "PROVIDER"
      ? inquiry.userId
        ? { userId: inquiry.userId, email: inquiry.email ?? undefined }
        : null
      : inquiry.provider
        ? {
            userId: inquiry.provider.userId,
            email: inquiry.provider.contactEmail,
          }
        : null;
  if (recipient) {
    await emitNotification({
      type: "THREAD_REPLY",
      recipients: [{ ...recipient, locale: getLocale(c) }],
      payload: {
        senderName:
          party === "PROVIDER"
            ? (inquiry.provider?.contactName ?? inquiry.name)
            : inquiry.name,
      },
      link:
        party === "PROVIDER"
          ? `/account/inquiries/${inquiry.id}`
          : `/dashboard/inquiries/${inquiry.id}`,
      origin: getOrigin(c),
    });
  }

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
      // Removed messages (#376) can't be read, so they never count as unread.
      deletedAt: null,
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
