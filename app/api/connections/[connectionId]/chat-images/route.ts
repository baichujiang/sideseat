import { randomBytes } from "node:crypto";

import { requireV1User } from "@/lib/api/v1/auth";
import { activeDirectConnectionWhere, assertDirectUnrepliedSendAllowed, PeerReplyRequiredError } from "@/lib/chat/direct-message-service";
import { chatImageBlobPrefix } from "@/lib/constants/chat-media";
import { prisma } from "@/lib/db/prisma";
import { error, ok } from "@/lib/http";
import { NativeImageUploadError, validateNativeImageFile } from "@/lib/media/native-image-upload";
import { putStoredMedia } from "@/lib/media/storage";
import { MediaStorageUnavailableError } from "@/lib/media/private-blob";
import { consumeMediaUploadAllowance, MediaUploadRateLimitError } from "@/lib/media/upload-allowance";
import { hashIdempotencyRequest, readIdempotencyKey } from "@/lib/api/v1/idempotency";
import { runV1Mutation } from "@/lib/api/v1/mutation";

export async function POST(request: Request, { params }: { params: Promise<{ connectionId: string }> }) {
  try {
    const auth = await requireV1User(request);
    if (!auth.ok) return auth.response;
    const user = auth.user;
    const idempotencyKey = readIdempotencyKey(request);
    if (!idempotencyKey) return error("A valid Idempotency-Key header is required.", 422, "IDEMPOTENCY_KEY_REQUIRED");
    const { connectionId } = await params;
    const connection = await prisma.connection.findFirst({
      where: activeDirectConnectionWhere(connectionId, user.id), select: { id: true, userAId: true, userBId: true },
    });
    if (!connection) return error("Connection not found.", 404);
    const blocked = await prisma.block.findFirst({ where: { OR: [
      { blockerId: connection.userAId, blockedId: connection.userBId },
      { blockerId: connection.userBId, blockedId: connection.userAId },
    ] }, select: { id: true } });
    if (blocked) return error("Connection not found.", 404);
    await prisma.$transaction(tx => assertDirectUnrepliedSendAllowed(tx, { connectionId, senderId: user.id }));
    const file = (await request.formData()).get("file");
    if (!(file instanceof File)) return error("Choose a JPG, PNG, or WEBP image.");
    const image = await validateNativeImageFile(file);
    const ext = image.contentType === "image/png" ? "png" : image.contentType === "image/webp" ? "webp" : "jpg";
    const result = await runV1Mutation({
      actorId: user.id, key: idempotencyKey, scope: `chat-image-upload:${connectionId}`,
      requestHash: hashIdempotencyRequest({ contentType: image.contentType, bytes: image.bytes.toString("base64") }),
      execute: async () => {
        await consumeMediaUploadAllowance(user.id);
        const key = `${chatImageBlobPrefix(connectionId)}${user.id}/${randomBytes(18).toString("hex")}.${ext}`;
        const blob = await putStoredMedia("chat", key, image.bytes, image.contentType);
        return { status: 200, body: { url: blob.url } };
      },
    });
    if (result.kind === "replay" || result.kind === "completed") return ok(result.body, {
      status: result.status, headers: result.kind === "replay" ? { "Idempotency-Replayed": "true" } : {},
    });
    return error("The matching upload is already in progress or the key was used for a different file.", 409, "IDEMPOTENCY_CONFLICT");
  } catch (cause) {
    if (cause instanceof MediaUploadRateLimitError) return Response.json({ success: false, error: cause.message, code: "RATE_LIMITED" }, { status: 429, headers: cause.headers });
    if (cause instanceof NativeImageUploadError) return error(cause.message, 400);
    if (cause instanceof MediaStorageUnavailableError) return error(cause.message, 503);
    if (cause instanceof PeerReplyRequiredError) return error(cause.message, 403, "PEER_REPLY_REQUIRED");
    console.error("POST chat image", cause);
    return error("Could not upload photo.");
  }
}
