import {
  inboxDirectPreviewToSnippet,
  resolveInboxDirectPreview,
  type InboxDirectPreviewMessage,
} from "@/lib/chat/inbox-direct-preview";
import type { AppLocale } from "@/lib/i18n/app-locale";
import type { AppMessages } from "@/lib/i18n/messages";

/**
 * Short text for reply strips, copy, and push previews for 1:1 messages.
 */
export function directMessageActionSnippet(
  message: InboxDirectPreviewMessage & { type: string; body: string; locationName: string | null },
  options?: { viewerUserId?: string; appLocale?: AppLocale; inboxPreviewCopy?: AppMessages["inbox"]["preview"] },
): string {
  const appLocale = options?.appLocale ?? "en";
  const copy = options?.inboxPreviewCopy;
  if (copy && options?.viewerUserId) {
    const preview = resolveInboxDirectPreview(message, options.viewerUserId, appLocale);
    return inboxDirectPreviewToSnippet(preview, copy);
  }

  if (message.type === "IMAGE") {
    return message.body.trim() || "Photo";
  }
  if (message.type === "LOCATION") {
    return message.body.trim() || message.locationName?.trim() || "Location";
  }
  if (message.type === "SCHEDULE_SHARE_CARD") {
    return copy?.scheduleShared ?? "Shared schedule";
  }
  if (message.type === "AVAILABILITY_CARD") {
    return copy?.availabilityShared ?? "Shared availability";
  }
  if (message.type === "PLAN_REQUEST_CARD" && message.planRequest) {
    const title = message.planRequest.title.trim() || "Plan";
    return copy?.planInvite ? `${copy.planInvite} · ${title}` : `Plan · ${title}`;
  }
  if (message.type === "PLAN_CONFIRMED_CARD" && message.planRequest) {
    const title = message.planRequest.title.trim() || "Plan";
    return copy?.planConfirmed ? `${copy.planConfirmed} · ${title}` : `Plan confirmed · ${title}`;
  }
  return message.body.trim() || "…";
}
