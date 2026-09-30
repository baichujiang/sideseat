import "server-only";
import { getSessionUser } from "@/lib/auth/session";
import { isConfiguredAdmin } from "@/lib/constants/app";
import { v1Error } from "@/lib/api/v1/http";
import { InviteAdminError } from "./admin";

export async function authorizeInviteAdmin(request: Request, mutation = false) {
  const user = await getSessionUser();
  if (!user || user.isGuest) return { ok: false as const, response: v1Error(request, { code: "AUTHENTICATION_REQUIRED", message: "请先登录管理员账号。", status: 401 }) };
  if (!user.onboardingComplete || !isConfiguredAdmin(user)) return { ok: false as const, response: v1Error(request, { code: "ACCOUNT_UNAVAILABLE", message: "当前账号没有管理员权限。", status: 403 }) };
  if (mutation) {
    const origin = request.headers.get("origin");
    if ((origin && origin !== new URL(request.url).origin) || !request.headers.get("content-type")?.startsWith("application/json")) {
      return { ok: false as const, response: v1Error(request, { code: "INVALID_REQUEST", message: "请求来源无效。", status: 403 }) };
    }
  }
  return { ok: true as const, user };
}

export function inviteAdminFailure(request: Request, cause: unknown) {
  if (cause instanceof InviteAdminError) return v1Error(request, { code: cause.status === 404 ? "NOT_FOUND" : "INVALID_REQUEST", message: cause.message, status: cause.status });
  console.error("Membership invitation administration failed", cause);
  return v1Error(request, { code: "INTERNAL_ERROR", message: "操作失败，请重试。", status: 500, retryable: true });
}
