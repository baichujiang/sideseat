import type { PlanRequestStatus } from "@prisma/client";

import { displayUserMessageBody } from "@/lib/assistant/display-user-message";
import { parseFaqTrigger } from "@/lib/assistant/faq-keys";
import { parseAssistantMessage } from "@/lib/assistant/message-payload";
import { formatPlanWhenCompact } from "@/lib/chat/format-plan-when";
import type { AppLocale } from "@/lib/i18n/app-locale";
import type { AppMessages } from "@/lib/i18n/messages";

export type InboxDirectPreview =
  | { kind: "text"; text: string }
  | { kind: "schedule_share" }
  | { kind: "plan_request"; title: string; when: string; needsYourReply: boolean }
  | { kind: "plan_confirmed"; title: string; when: string }
  | { kind: "availability" }
  | { kind: "image" }
  | { kind: "location"; place?: string };

export type InboxDirectPreviewMessage = {
  type: string;
  body: string;
  locationName: string | null;
  planRequest?: {
    title: string;
    startTime: Date;
    endTime: Date;
    status: PlanRequestStatus;
    receiverUserId: string;
    proposerUserId: string;
  } | null;
};

export function resolveInboxDirectPreview(
  message: InboxDirectPreviewMessage,
  viewerUserId: string,
  appLocale: AppLocale,
): InboxDirectPreview {
  if (message.type === "IMAGE") {
    return { kind: "image" };
  }
  if (message.type === "LOCATION") {
    const place = message.body.trim() || message.locationName?.trim() || undefined;
    return { kind: "location", place };
  }
  if (message.type === "SCHEDULE_SHARE_CARD") {
    return { kind: "schedule_share" };
  }
  if (message.type === "AVAILABILITY_CARD") {
    return { kind: "availability" };
  }
  if (
    (message.type === "PLAN_REQUEST_CARD" || message.type === "PLAN_CONFIRMED_CARD") &&
    message.planRequest
  ) {
    const pr = message.planRequest;
    const when = formatPlanWhenCompact(pr.startTime, pr.endTime, appLocale);
    const title = pr.title.trim() || "Plan";
    if (message.type === "PLAN_CONFIRMED_CARD" || pr.status === "ACCEPTED") {
      return { kind: "plan_confirmed", title, when };
    }
    return {
      kind: "plan_request",
      title,
      when,
      needsYourReply: pr.status === "PENDING" && pr.receiverUserId === viewerUserId,
    };
  }
  // Hide FAQ trigger tokens and serialized [sideseat-actions] blocks in list previews.
  if (parseFaqTrigger(message.body)) {
    return { kind: "text", text: displayUserMessageBody(message.body, appLocale) };
  }
  const text = parseAssistantMessage(message.body).text.trim();
  return { kind: "text", text: text || "…" };
}

export function inboxDirectPreviewToSnippet(
  preview: InboxDirectPreview,
  copy: AppMessages["inbox"]["preview"],
): string {
  switch (preview.kind) {
    case "text":
      return preview.text;
    case "schedule_share":
      return copy.scheduleShared;
    case "plan_request":
      return preview.needsYourReply
        ? `${copy.planInvite} · ${preview.title}`
        : `${copy.planInvite} · ${preview.title}`;
    case "plan_confirmed":
      return `${copy.planConfirmed} · ${preview.title}`;
    case "availability":
      return copy.availabilityShared;
    case "image":
      return copy.photo;
    case "location":
      return preview.place || copy.location;
    default:
      return "…";
  }
}
