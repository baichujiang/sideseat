import { Prisma } from "@prisma/client";

import { requireV1User } from "@/lib/api/v1/auth";
import {
  discoverMutationResponse,
  limitDiscoverWrite,
  requireDiscoverIdempotencyKey,
} from "@/lib/api/v1/discover-route";
import { v1Error } from "@/lib/api/v1/http";
import { hashIdempotencyRequest } from "@/lib/api/v1/idempotency";
import { runV1Mutation } from "@/lib/api/v1/mutation";
import { classmatePostImageBlobPrefix } from "@/lib/constants/classmate-post-media";
import {
  NativeImageUploadError,
  uploadNativeImage,
  validateNativeImageFile,
} from "@/lib/media/native-image-upload";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;
  const idempotency = requireDiscoverIdempotencyKey(request);
  if (!idempotency.ok) return idempotency.response;

  try {
    const limited = await limitDiscoverWrite(request, auth.user.id);
    if (limited) return limited;

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return v1Error(request, {
        code: "INVALID_REQUEST",
        message: "Choose a JPG, PNG, or WEBP image.",
        status: 422,
        field: "file",
      });
    }

    const image = await validateNativeImageFile(file);
    const result = await runV1Mutation({
      actorId: auth.user.id,
      key: idempotency.key,
      scope: "native-discover-post-image-upload",
      requestHash: hashIdempotencyRequest({
        contentType: image.contentType,
        width: image.width,
        height: image.height,
        byteSize: image.bytes.byteLength,
        bytes: image.bytes.toString("base64"),
      }),
      execute: async () => {
        const uploaded = await uploadNativeImage({
          image,
          blobPrefix: classmatePostImageBlobPrefix(auth.user.id),
          logScope: "v1/discover/posts/images",
        });
        return {
          status: 201,
          body: { image: uploaded } as Prisma.InputJsonObject,
        };
      },
    });
    return discoverMutationResponse(request, result);
  } catch (cause) {
    if (cause instanceof NativeImageUploadError) {
      return v1Error(request, {
        code: "INVALID_REQUEST",
        message: cause.message,
        status: 422,
        field: cause.field,
      });
    }
    console.error("POST /api/v1/discover/posts/images", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "The buddy post image could not be uploaded.",
      status: 500,
      retryable: true,
    });
  }
}
