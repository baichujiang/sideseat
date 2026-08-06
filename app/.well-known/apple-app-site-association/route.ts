import { NextResponse } from "next/server";

/**
 * Apple App Site Association for Universal Links.
 * Team ID from `APPLE_TEAM_ID` or `APNS_TEAM_ID` (same Apple Developer Team).
 * Bundle ID must match native `PRODUCT_BUNDLE_IDENTIFIER` (app.sideseat.mobile).
 */
export function GET() {
  const teamId =
    process.env.APPLE_TEAM_ID?.trim() ||
    process.env.APNS_TEAM_ID?.trim() ||
    "V4238R5R53";
  const bundleId = process.env.APPLE_BUNDLE_ID?.trim() || "app.sideseat.mobile";
  const appID = `${teamId}.${bundleId}`;

  const body = {
    applinks: {
      apps: [] as string[],
      details: [
        {
          appIDs: [appID],
          components: [
            { "/": "/users/*", comment: "Public profiles" },
            { "/": "/connections/*", comment: "Direct chats" },
            { "/": "/courses/*", comment: "Courses and course chat" },
            { "/": "/groups/*", comment: "Group chats" },
            { "/": "/discover/posts/*", comment: "Discover posts" },
            { "/": "/discover/activities/*", comment: "Discover activities" },
            { "/": "/activities/*", comment: "Activities" },
            { "/": "/share/view/*", comment: "Schedule share links" },
            { "/": "/profile*", comment: "Account and verification handoff" },
          ],
        },
      ],
    },
  };

  return NextResponse.json(body, {
    headers: {
      // Apple fetches without file extension; JSON is accepted.
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=300",
    },
  });
}
