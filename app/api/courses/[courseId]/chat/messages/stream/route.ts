import { requireCourseChatMember } from "@/lib/auth/guards";
import { latestMessageIdSseResponse } from "@/lib/chat/latest-message-id-sse";
import { CHAT_SSE_POLL_MS } from "@/lib/constants/app";
import { prisma } from "@/lib/db/prisma";
import { error } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ courseId: string }> },
) {
  try {
    const { courseId } = await params;
    await requireCourseChatMember(courseId);

    return latestMessageIdSseResponse(request, {
      pollIntervalMs: CHAT_SSE_POLL_MS,
      getLatestMessageId: async () => {
        const latest = await prisma.courseRoomMessage.findFirst({
          where: { courseId },
          orderBy: { createdAt: "desc" },
          select: { id: true },
        });
        return latest?.id ?? null;
      },
    });
  } catch (cause) {
    console.error(cause);
    return error("Unable to open message stream.");
  }
}
