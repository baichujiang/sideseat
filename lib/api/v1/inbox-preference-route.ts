import "server-only";

import { z } from "zod";

import { requireV1User } from "@/lib/api/v1/auth";
import {
  InboxPreferenceError,
  type InboxPreferenceState,
} from "@/lib/api/v1/inbox-preference-service";
import { v1Error, v1Success } from "@/lib/api/v1/http";

const cuidSchema = z.string().cuid();

export function requireInboxCuid(
  request: Request,
  value: string,
  field: string,
) {
  if (!cuidSchema.safeParse(value).success) {
    return {
      ok: false as const,
      response: v1Error(request, {
        code: "INVALID_REQUEST",
        message: `The ${field} is invalid.`,
        status: 422,
        field,
      }),
    };
  }
  return { ok: true as const };
}

export async function runInboxPreferenceMutation(options: {
  request: Request;
  field: string;
  id: string;
  execute: (userId: string) => Promise<InboxPreferenceState>;
  logLabel: string;
}) {
  const auth = await requireV1User(options.request);
  if (!auth.ok) return auth.response;

  const idCheck = requireInboxCuid(options.request, options.id, options.field);
  if (!idCheck.ok) return idCheck.response;

  try {
    const data = await options.execute(auth.user.id);
    return v1Success(data, { request: options.request });
  } catch (cause) {
    if (cause instanceof InboxPreferenceError) {
      return v1Error(options.request, {
        code: "NOT_FOUND",
        message: "The conversation was not found.",
        status: 404,
      });
    }
    console.error(options.logLabel, cause);
    return v1Error(options.request, {
      code: "INTERNAL_ERROR",
      message: "The inbox preference could not be updated.",
      status: 500,
      retryable: true,
    });
  }
}
