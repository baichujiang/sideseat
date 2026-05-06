import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Shallow deploy fingerprint for clients that cannot rely on SW update (esp. iOS
 * standalone). Prefer Vercel ids when present.
 */
export function GET() {
  const id =
    process.env.VERCEL_DEPLOYMENT_ID ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.BUILD_ID ||
    "development";

  return NextResponse.json(
    { id },
    {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
      },
    },
  );
}
