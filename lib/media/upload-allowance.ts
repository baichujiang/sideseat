import "server-only";
import { consumeV1RateLimit, rateLimitHeaders, rateLimitSubject, type RateLimitResult } from "@/lib/api/v1/rate-limit";

export class MediaUploadRateLimitError extends Error {
  readonly headers: Record<string, string>;
  constructor(result: RateLimitResult) {
    super("Too many photos were uploaded. Please try again later.");
    this.name = "MediaUploadRateLimitError";
    this.headers = rateLimitHeaders(result);
  }
}

/** Shared across avatar, profile, post and chat uploads; not a membership quota. */
export async function consumeMediaUploadAllowance(userId: string) {
  const subject = rateLimitSubject(userId);
  for (const rule of [
    { scope: "media-upload-minute", limit: 12, windowMs: 60_000 },
    { scope: "media-upload-day", limit: 50, windowMs: 86_400_000 },
  ]) {
    const result = await consumeV1RateLimit({ ...rule, subject });
    if (!result.allowed) throw new MediaUploadRateLimitError(result);
  }
}
