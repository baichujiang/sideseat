import { NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import {
  eventShareSnapshot,
  resolveEventShareLink,
} from "@/lib/event-share/event-share-service";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const link = await resolveEventShareLink(prisma, safeDecode(token));
  if (!link) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "This shared event is unavailable or has expired." } },
      { status: 404, headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  }
  return NextResponse.json(
    { data: { snapshot: eventShareSnapshot(link) } },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } },
  );
}

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
