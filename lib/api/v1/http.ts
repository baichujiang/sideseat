import "server-only";

import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import type { ZodSchema } from "zod";

export type V1Meta = Record<string, unknown>;

export type V1ErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_CREDENTIALS"
  | "AUTHENTICATION_REQUIRED"
  | "REFRESH_TOKEN_INVALID"
  | "REFRESH_TOKEN_EXPIRED"
  | "REFRESH_TOKEN_REUSED"
  | "DEVICE_MISMATCH"
  | "ACCOUNT_UNAVAILABLE"
  | "CONTENT_RESTRICTED"
  | "PEER_REPLY_REQUIRED"
  | "COORDINATION_POLICY_UNSUPPORTED"
  | "FEATURE_UNAVAILABLE"
  | "BUILT_IN_CALENDAR"
  | "NOT_FOUND"
  | "DATABASE_UNAVAILABLE"
  | "RATE_LIMITED"
  | "IDEMPOTENCY_KEY_REQUIRED"
  | "IDEMPOTENCY_CONFLICT"
  | "REQUEST_IN_PROGRESS"
  | "STATE_CONFLICT"
  | "CURSOR_EXPIRED"
  | "REALTIME_CURSOR_EXPIRED"
  | "USERNAME_TAKEN"
  | "USERNAME_CHANGE_COOLDOWN"
  | "INTERNAL_ERROR";

export function v1RequestId(request?: Request): string {
  const incoming = request?.headers.get("x-request-id")?.trim();
  if (incoming && /^[A-Za-z0-9._:-]{1,80}$/.test(incoming)) {
    return incoming;
  }
  return randomUUID();
}

function responseHeaders(requestId: string, extra?: HeadersInit) {
  const headers = new Headers(extra);
  headers.set("Cache-Control", "private, no-store, max-age=0");
  headers.set("X-Request-Id", requestId);
  return headers;
}

export function v1Success<T>(
  data: T,
  options: {
    request?: Request;
    requestId?: string;
    status?: number;
    meta?: V1Meta;
    headers?: HeadersInit;
  } = {},
) {
  const requestId = options.requestId ?? v1RequestId(options.request);
  return NextResponse.json(
    options.meta ? { data, meta: options.meta } : { data },
    {
      status: options.status ?? 200,
      headers: responseHeaders(requestId, options.headers),
    },
  );
}

export function v1Error(
  request: Request | undefined,
  options: {
    code: V1ErrorCode;
    message: string;
    status: number;
    field?: string;
    retryable?: boolean;
    recovery?: Readonly<{
      action: "OPEN_PLAN" | "OPEN_ACTION_CONTEXT";
      focus:
        | Readonly<{
            type: "PLAN";
            connectionId: string;
            commitmentId: string;
            revisionId: string;
          }>
        | Readonly<{
            type: "ACTION_CONTEXT";
            connectionId: string;
            contextId: string;
          }>;
    }>;
    requestId?: string;
    headers?: HeadersInit;
  },
) {
  const requestId = options.requestId ?? v1RequestId(request);
  return NextResponse.json(
    {
      error: {
        code: options.code,
        message: options.message,
        ...(options.field ? { field: options.field } : {}),
        retryable: options.retryable ?? false,
        requestId,
      },
      ...(options.recovery ? { recovery: options.recovery } : {}),
    },
    {
      status: options.status,
      headers: responseHeaders(requestId, options.headers),
    },
  );
}

export async function parseV1Json<T>(
  request: Request,
  schema: ZodSchema<T>,
): Promise<{ ok: true; data: T } | { ok: false; response: NextResponse }> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return {
      ok: false,
      response: v1Error(request, {
        code: "INVALID_REQUEST",
        message: "Request body must be valid JSON.",
        status: 400,
      }),
    };
  }

  const parsed = schema.safeParse(body);
  if (parsed.success) {
    return { ok: true, data: parsed.data };
  }

  const issue = parsed.error.issues[0];
  return {
    ok: false,
    response: v1Error(request, {
      code: "INVALID_REQUEST",
      message: issue?.message ?? "Invalid request.",
      status: 422,
      field: issue?.path.length ? issue.path.join(".") : undefined,
    }),
  };
}
