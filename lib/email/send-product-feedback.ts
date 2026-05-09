import { APP_NAME } from "@/lib/constants/app";
import { getEmailFrom, getResendClient } from "@/lib/email/resend";

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function topicLabel(topic: string): string {
  switch (topic) {
    case "bug":
      return "Bug / problem";
    case "idea":
      return "Feature idea";
    default:
      return "Other";
  }
}

export type SendProductFeedbackResult =
  | { sent: true; id: string | null }
  | { sent: false; reason: string };

export async function sendProductFeedback(args: {
  to: string;
  userId: string;
  userEmail: string | null;
  nickname: string | null;
  topic: string;
  message: string;
}): Promise<SendProductFeedbackResult> {
  const resend = getResendClient();
  const from = getEmailFrom();
  if (!resend || !from) {
    return { sent: false, reason: "Email is not configured." };
  }

  const safeBody = escapeHtml(args.message).replace(/\n/g, "<br/>");

  const html = `
    <div style="margin:0;padding:24px 12px;background:#f4f4f5;font-family:system-ui,sans-serif;color:#111827;">
      <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:24px;border:1px solid #e5e7eb;">
        <p style="margin:0 0 8px;font-size:12px;text-transform:uppercase;letter-spacing:0.08em;color:#6b7280;">${escapeHtml(APP_NAME)} feedback</p>
        <p style="margin:0 0 16px;"><strong>Topic:</strong> ${escapeHtml(topicLabel(args.topic))}</p>
        <p style="margin:0 0 8px;"><strong>User id:</strong> ${escapeHtml(args.userId)}</p>
        <p style="margin:0 0 8px;"><strong>Email:</strong> ${escapeHtml(args.userEmail ?? "—")}</p>
        <p style="margin:0 0 16px;"><strong>Nickname:</strong> ${escapeHtml(args.nickname ?? "—")}</p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0;" />
        <p style="margin:0 0 8px;font-weight:600;">Message</p>
        <div style="margin:0;font-size:15px;line-height:1.6;color:#374151;">${safeBody}</div>
      </div>
    </div>
  `;

  try {
    const result = await resend.emails.send({
      from,
      to: args.to,
      subject: `[${APP_NAME} feedback] ${topicLabel(args.topic)}`,
      html,
    });
    return { sent: true, id: result.data?.id ?? null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Send failed";
    return { sent: false, reason: msg };
  }
}
