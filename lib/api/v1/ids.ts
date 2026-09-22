import "server-only";

import { z } from "zod";

import { v1Error } from "@/lib/api/v1/http";

const cuidSchema = z.string().cuid();

export function requireV1Cuid(
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
