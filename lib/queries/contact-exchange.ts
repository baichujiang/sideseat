import type { ContactExchangeRequest, User } from "@prisma/client";

import { CONTACT_EXCHANGE_DECLINE_COOLDOWN_HOURS } from "@/lib/constants/app";

export type ContactHandles = {
  wechat: string | null;
  whatsapp: string | null;
  telegram: string | null;
  instagram: string | null;
};

export type ContactExchangeState =
  | { kind: "none" }
  | { kind: "outgoing_pending"; requestId: string }
  | { kind: "incoming_pending"; requestId: string }
  | { kind: "accepted" }
  | { kind: "cooldown"; until: Date };

/**
 * Reduce a connection's contact-exchange history (newest first) down to the
 * state we render in the UI. Keeping this in one place means the chat bar and
 * the profile panel always agree on what the user can do next.
 *
 * Rules:
 *  - If any ACCEPTED row exists, the state is `accepted` (terminal for this
 *    connection; if both sides later want to "un-share" they can just delete
 *    handles from /me).
 *  - Else, if the newest row is PENDING, it's `incoming_pending` for the
 *    responder and `outgoing_pending` for the requester.
 *  - Else, if the newest row was DECLINED within the cooldown window, we're
 *    in `cooldown` (until `row.updatedAt + cooldown`). A requester cancel is
 *    not a rejection and immediately returns the exchange to `none`.
 *  - Otherwise `none` — anyone can kick off a new request.
 */
export function deriveContactExchangeState(
  requests: Array<
    Pick<
      ContactExchangeRequest,
      "id" | "status" | "requesterId" | "responderId" | "updatedAt"
    >
  >,
  viewerId: string,
): ContactExchangeState {
  if (requests.some((r) => r.status === "ACCEPTED")) {
    return { kind: "accepted" };
  }

  const latest = requests[0];
  if (!latest) return { kind: "none" };

  if (latest.status === "PENDING") {
    return latest.requesterId === viewerId
      ? { kind: "outgoing_pending", requestId: latest.id }
      : { kind: "incoming_pending", requestId: latest.id };
  }

  if (latest.status === "DECLINED") {
    const cooldownMs = CONTACT_EXCHANGE_DECLINE_COOLDOWN_HOURS * 60 * 60 * 1000;
    const until = new Date(latest.updatedAt.getTime() + cooldownMs);
    if (until.getTime() > Date.now()) {
      return { kind: "cooldown", until };
    }
  }

  return { kind: "none" };
}

export function extractHandles(
  user: Pick<
    User,
    "wechatHandle" | "whatsappHandle" | "telegramHandle" | "instagramHandle"
  >,
): ContactHandles {
  return {
    wechat: user.wechatHandle,
    whatsapp: user.whatsappHandle,
    telegram: user.telegramHandle,
    instagram: user.instagramHandle,
  };
}

export function handlesAreEmpty(handles: ContactHandles): boolean {
  return (
    !handles.wechat && !handles.whatsapp && !handles.telegram && !handles.instagram
  );
}

/**
 * Safe serializer for sending peer contact info to the client. Returns `null`
 * unless the exchange is ACCEPTED. The server-side pages should always use
 * this instead of threading handles directly, so a UI regression can't leak
 * them.
 */
export function peerHandlesIfAccepted(
  state: ContactExchangeState,
  peer: Pick<
    User,
    "wechatHandle" | "whatsappHandle" | "telegramHandle" | "instagramHandle"
  >,
): ContactHandles | null {
  return state.kind === "accepted" ? extractHandles(peer) : null;
}
