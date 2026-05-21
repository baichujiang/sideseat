import { NextResponse } from "next/server";
import { ZodError, type ZodSchema } from "zod";

export async function parseJson<T>(request: Request, schema: ZodSchema<T>) {
  const body = await request.json();
  return schema.parse(body);
}

/** Safe parse with a single human-readable message (for API routes). */
export function parseBody<T>(
  body: unknown,
  schema: ZodSchema<T>,
): { ok: true; data: T } | { ok: false; error: string } {
  const result = schema.safeParse(body);
  if (!result.success) {
    const err = result.error.errors[0];
    const path = err.path.length ? `${err.path.join(".")}: ` : "";
    return { ok: false, error: `${path}${err.message}` };
  }
  return { ok: true, data: result.data };
}

export function ok(data: unknown, init?: ResponseInit) {
  return NextResponse.json({ success: true, data }, init);
}

export function error(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export function formatZodError(cause: ZodError): string {
  const first = cause.errors[0];
  if (!first) return "Invalid request.";
  const path = first.path.length ? `${first.path.join(".")}: ` : "";
  return `${path}${first.message}`;
}
