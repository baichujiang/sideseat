import { z } from "zod";

import { requireV1User } from "@/lib/api/v1/auth";
import {
  AccountServiceError,
  deleteAccount,
} from "@/lib/api/v1/account-service";
import { getSessionUser } from "@/lib/auth/session";
import { loadNativeCurrentProfile } from "@/lib/api/v1/profile-service";
import { runIdempotentV1Mutation } from "@/lib/api/v1/idempotent-mutation";
import { parseV1Json, v1Error, v1Success } from "@/lib/api/v1/http";

export const dynamic = "force-dynamic";

const deleteSchema = z.object({
  confirmUsername: z.string().trim().min(1).max(64),
});

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user || user.isGuest) {
    return v1Error(request, {
      code: "AUTHENTICATION_REQUIRED",
      message: "Sign in is required.",
      status: 401,
    });
  }

  const language = request.headers.get("accept-language")?.toLowerCase() ?? "";
  const data = await loadNativeCurrentProfile({
    user,
    locale: language.startsWith("zh") ? "zh-CN" : "en",
  });
  if (!data) {
    return v1Error(request, {
      code: "NOT_FOUND",
      message: "The current profile was not found.",
      status: 404,
    });
  }
  return v1Success(data, { request });
}

export async function DELETE(request: Request) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;

  const parsed = await parseV1Json(request, deleteSchema);
  if (!parsed.ok) return parsed.response;

  try {
    return await runIdempotentV1Mutation({
      request,
      actorId: auth.user.id,
      scope: "native-account-delete",
      requestBody: parsed.data,
      execute: async () => ({
        status: 200,
        body: await deleteAccount({
          userId: auth.user.id,
          username: auth.user.username,
          confirmUsername: parsed.data.confirmUsername,
        }),
      }),
    });
  } catch (cause) {
    if (cause instanceof AccountServiceError) {
      return v1Error(request, {
        code: "INVALID_REQUEST",
        message: cause.messageText,
        status: 422,
        field: "confirmUsername",
      });
    }
    console.error("DELETE /api/v1/me", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "The account could not be deleted.",
      status: 500,
      retryable: true,
    });
  }
}
