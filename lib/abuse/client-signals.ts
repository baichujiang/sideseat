import { createHash } from "crypto";
import { ClientSignalAction } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import type { ClientContextInput } from "@/lib/validators/client-context";

function hashIp(ip: string | null) {
  if (!ip) {
    return null;
  }

  const salt = process.env.SESSION_SECRET ?? "sideseat";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

function getRequestIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");

  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() ?? null;
  }

  return request.headers.get("x-real-ip");
}

export async function recordClientSignal({
  request,
  action,
  wasSuccessful,
  userId,
  attemptedEmail,
  clientContext,
}: {
  request: Request;
  action: ClientSignalAction;
  wasSuccessful: boolean;
  userId?: string;
  attemptedEmail?: string;
  clientContext?: ClientContextInput;
}) {
  try {
    await prisma.clientSignal.create({
      data: {
        userId,
        action,
        wasSuccessful,
        attemptedEmail: attemptedEmail?.toLowerCase(),
        installId: clientContext?.installId,
        ipHash: hashIp(getRequestIp(request)),
        userAgent: request.headers.get("user-agent"),
        acceptLanguage: request.headers.get("accept-language") ?? clientContext?.language,
        timezone: clientContext?.timezone,
        platform: clientContext?.platform,
        screenWidth: clientContext?.screenWidth,
        screenHeight: clientContext?.screenHeight,
      },
    });
  } catch (error) {
    console.error("Failed to record client signal", error);
  }
}
