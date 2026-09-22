export type PushNotificationKind =
  | "direct_message"
  | "course_message"
  | "group_message"
  | "plan_invite"
  | "plan_counter"
  | "plan_accepted"
  | "plan_declined"
  | "discover_comment"
  | "discover_reply";

export type UserPushPayload = {
  title: string;
  body: string;
  url?: string;
  badge?: number;
  threadId?: string;
  category?: string;
  data?: Record<string, string>;
};

export function buildApnsPayload(payload: UserPushPayload) {
  const badge =
    typeof payload.badge === "number" && Number.isFinite(payload.badge)
      ? Math.max(0, Math.floor(payload.badge))
      : undefined;

  return {
    aps: {
      alert: { title: payload.title, body: payload.body },
      sound: "default",
      ...(badge !== undefined ? { badge } : {}),
      ...(payload.threadId ? { "thread-id": payload.threadId } : {}),
      ...(payload.category ? { category: payload.category } : {}),
    },
    ...(payload.url ? { url: payload.url } : {}),
    ...(payload.data ?? {}),
  };
}
