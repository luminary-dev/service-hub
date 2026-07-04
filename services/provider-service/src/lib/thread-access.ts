// Who may read/write an inquiry's message thread (#13): exactly the customer
// who sent it (signed-in inquiries only — anonymous ones have no identity to
// authenticate) and the provider who received it. Pure so the decision is
// unit-testable.
import type { AuthUser } from "./http";

export type ThreadParty = "CUSTOMER" | "PROVIDER";

export function resolveThreadParty(
  inquiry: { userId: string | null; provider: { userId: string } },
  auth: AuthUser | null
): ThreadParty | null {
  if (!auth) return null;
  if (inquiry.userId !== null && inquiry.userId === auth.userId) {
    return "CUSTOMER";
  }
  if (inquiry.provider.userId === auth.userId) {
    return "PROVIDER";
  }
  return null;
}

// The column holding the given party's last-read marker.
export function lastReadField(
  party: ThreadParty
): "customerLastReadAt" | "providerLastReadAt" {
  return party === "CUSTOMER" ? "customerLastReadAt" : "providerLastReadAt";
}

// The sender value whose messages count as unread FOR the given party.
export function otherParty(party: ThreadParty): ThreadParty {
  return party === "CUSTOMER" ? "PROVIDER" : "CUSTOMER";
}
