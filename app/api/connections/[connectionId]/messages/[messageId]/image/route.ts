import { getSessionUser } from "@/lib/auth/session";
import { activeDirectConnectionWhere } from "@/lib/chat/direct-message-service";
import { prisma } from "@/lib/db/prisma";
import { verifyChatImageGrant } from "@/lib/media/chat-image-access";
import { readChatImage } from "@/lib/media/chat-image-storage";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };

export async function GET(request: Request, { params }: { params: Promise<{ connectionId: string; messageId: string }> }) {
  const { connectionId, messageId } = await params;
  const session = await getSessionUser();
  const viewerId = session?.id ?? (!request.headers.has("authorization")
    ? verifyChatImageGrant(new URL(request.url), connectionId, messageId) : null);
  if (!viewerId) return new Response(null, { status: 401, headers });
  const message = await prisma.message.findFirst({
    where: { id: messageId, connectionId, type: "IMAGE", deletedAt: null,
      connection: activeDirectConnectionWhere(connectionId, viewerId) },
    select: { imageUrl: true, connection: { select: { userAId: true, userBId: true } } },
  });
  if (!message?.imageUrl) return new Response(null, { status: 404, headers });
  const { userAId, userBId } = message.connection;
  const blocked = await prisma.block.findFirst({ where: { OR: [
    { blockerId: userAId, blockedId: userBId }, { blockerId: userBId, blockedId: userAId },
  ] }, select: { id: true } });
  if (blocked) return new Response(null, { status: 404, headers });
  try {
    const image = await readChatImage(message.imageUrl, connectionId);
    if (!image) return new Response(null, { status: 404, headers });
    return new Response(image.stream, { headers: { ...headers, "Content-Type": image.contentType } });
  } catch (cause) {
    console.error("GET private chat image failed", cause instanceof Error ? cause.name : "unknown");
    return new Response(null, { status: 503, headers });
  }
}
