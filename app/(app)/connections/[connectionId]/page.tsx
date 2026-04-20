import { format } from "date-fns";
import { ReportReason } from "@prisma/client";

import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { MessageForm } from "@/components/forms/message-form";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireConnection } from "@/lib/auth/guards";

export default async function ConnectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ connectionId: string }>;
  searchParams?: Promise<{ reported?: string }>;
}) {
  const { connectionId } = await params;
  const query = (await searchParams) ?? {};
  const { connection, user } = await requireConnection(connectionId);
  const otherUser = connection.userAId === user.id ? connection.userB : connection.userA;
  const pendingExchangeRequest = connection.contactExchangeRequests.find(
    (request) => request.responderId === user.id && request.status === "PENDING",
  );
  const acceptedContactExchange = connection.contactExchangeRequests.find(
    (request) => request.status === "ACCEPTED",
  );

  return (
    <div className="space-y-5">
      <Card className="space-y-3 bg-[linear-gradient(135deg,rgba(238,244,240,0.96),rgba(255,255,255,0.94))]">
        <div className="flex items-start justify-between gap-3">
          <CardTitle>{otherUser.nickname}</CardTitle>
          <StatusBadge tone="calm">light chat</StatusBadge>
        </div>
        {connection.invitation?.course ? (
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone="neutral">{connection.invitation.course.name}</StatusBadge>
          </div>
        ) : null}
      </Card>

      {query.reported === "1" ? (
        <Card className="space-y-2 border-[#d5e9df] bg-[#eef8f2]">
          <CardTitle>Report submitted</CardTitle>
        </Card>
      ) : null}

      <Card className="space-y-4 bg-[rgba(255,255,255,0.7)]">
        <CardTitle>Conversation</CardTitle>
        <div className="space-y-3">
          {connection.messages.map((message) => {
            const isOwn = message.senderId === user.id;

            return (
              <div
                key={message.id}
                className={`flex ${isOwn ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[84%] rounded-3xl px-4 py-3 text-sm ${
                    isOwn ? "bg-primary text-primary-foreground" : "bg-card text-foreground"
                  }`}
                >
                  <p>{message.body}</p>
                  <p className="mt-2 text-[11px] opacity-75">
                    {format(message.createdAt, "MMM d, HH:mm")}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="space-y-4">
        <CardTitle>Send a message</CardTitle>
        <MessageForm connectionId={connection.id} />
      </Card>

      <Card className="space-y-3">
        <CardTitle>Private contact exchange</CardTitle>
        {acceptedContactExchange ? (
          <div className="space-y-2 text-sm">
            {otherUser.wechatHandle ? <p>WeChat: {otherUser.wechatHandle}</p> : null}
            {otherUser.whatsappHandle ? <p>WhatsApp: {otherUser.whatsappHandle}</p> : null}
            {otherUser.telegramHandle ? <p>Telegram: {otherUser.telegramHandle}</p> : null}
            {otherUser.instagramHandle ? <p>Instagram: {otherUser.instagramHandle}</p> : null}
          </div>
        ) : pendingExchangeRequest ? (
          <form action={`/api/connections/${connection.id}/contact-exchange`} method="post">
            <input name="action" type="hidden" value="accept" />
            <Button className="w-full" type="submit">
              Accept contact exchange
            </Button>
          </form>
        ) : (
          <form action={`/api/connections/${connection.id}/contact-exchange`} method="post">
            <input name="action" type="hidden" value="request" />
            <Button className="w-full" type="submit" variant="outline">
              Request contact exchange
            </Button>
          </form>
        )}
      </Card>

      <Card className="space-y-4">
        <CardTitle>Safety controls</CardTitle>
        <form action="/api/reports" className="space-y-3" method="post">
          <input name="reportedUserId" type="hidden" value={otherUser.id} />
          <input name="connectionId" type="hidden" value={connection.id} />
          <input name="returnTo" type="hidden" value={`/connections/${connection.id}`} />
          <select
            className="h-11 w-full rounded-2xl border border-border bg-background px-4 text-sm"
            defaultValue={ReportReason.HARASSMENT}
            name="reason"
          >
            {Object.values(ReportReason).map((reason) => (
              <option key={reason} value={reason}>
                {reason.toLowerCase().replaceAll("_", " ")}
              </option>
            ))}
          </select>
          <textarea
            className="min-h-24 w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm"
            name="details"
            placeholder="Optional details for the moderation team"
          />
          <Button className="w-full" type="submit" variant="ghost">
            Submit report
          </Button>
        </form>
      </Card>

      <div className="grid gap-3">
        <form action={`/api/connections/${connection.id}/end`} method="post">
          <Button className="w-full" type="submit" variant="outline">
            End connection
          </Button>
        </form>
        <form action="/api/blocks" method="post">
          <input name="blockedId" type="hidden" value={otherUser.id} />
          <input name="connectionId" type="hidden" value={connection.id} />
          <Button className="w-full" type="submit" variant="outline">
            Block user
          </Button>
        </form>
      </div>
    </div>
  );
}
