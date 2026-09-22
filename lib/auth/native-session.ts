import "server-only";

import { createHash, randomBytes, randomUUID } from "crypto";
import { addDays } from "date-fns";
import { SessionClientKind, SessionRevocationReason, type User } from "@prisma/client";

import type { NativeDevice } from "@/lib/api/v1/auth-schemas";
import { REFRESH_TOKEN_TTL_DAYS } from "@/lib/constants/app";
import { prisma } from "@/lib/db/prisma";

const REFRESH_TOKEN_BYTES = 32;

function hashRefreshToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function newRefreshToken() {
  return randomBytes(REFRESH_TOKEN_BYTES).toString("base64url");
}

export type NativeRefreshCredentials = {
  refreshToken: string;
  refreshExpiresAt: string;
};

export type RotateNativeSessionResult =
  | {
      ok: true;
      user: User;
      credentials: NativeRefreshCredentials;
    }
  | {
      ok: false;
      reason: "invalid" | "expired" | "reused" | "device_mismatch";
    };

class NativeSessionClaimLost extends Error {}

async function revokeFamily(
  familyId: string,
  reason: SessionRevocationReason,
  at = new Date(),
) {
  await prisma.session.updateMany({
    where: {
      familyId,
      clientKind: SessionClientKind.IOS,
      revokedAt: null,
    },
    data: { revokedAt: at, revocationReason: reason, lastUsedAt: at },
  });
}

export async function createNativeSession(
  userId: string,
  device: NativeDevice,
): Promise<NativeRefreshCredentials> {
  const now = new Date();
  const familyExpiresAt = addDays(now, REFRESH_TOKEN_TTL_DAYS);
  const familyId = randomUUID();
  const refreshToken = newRefreshToken();

  await prisma.$transaction(async (tx) => {
    await tx.session.updateMany({
      where: {
        userId,
        clientKind: SessionClientKind.IOS,
        deviceId: device.id,
        revokedAt: null,
      },
      data: {
        revokedAt: now,
        revocationReason: SessionRevocationReason.DEVICE_REPLACED,
        lastUsedAt: now,
      },
    });
    await tx.session.create({
      data: {
        userId,
        tokenHash: hashRefreshToken(refreshToken),
        expiresAt: familyExpiresAt,
        clientKind: SessionClientKind.IOS,
        familyId,
        familyExpiresAt,
        deviceId: device.id,
        deviceName: device.name,
        appVersion: device.appVersion,
        platformVersion: device.platformVersion,
        lastUsedAt: now,
      },
    });
  });

  return {
    refreshToken,
    refreshExpiresAt: familyExpiresAt.toISOString(),
  };
}

export async function rotateNativeSession(
  refreshToken: string,
  device: NativeDevice,
): Promise<RotateNativeSessionResult> {
  const existing = await prisma.session.findUnique({
    where: { tokenHash: hashRefreshToken(refreshToken) },
    include: { user: true },
  });

  if (
    !existing ||
    existing.clientKind !== SessionClientKind.IOS ||
    !existing.familyId ||
    !existing.familyExpiresAt
  ) {
    return { ok: false, reason: "invalid" };
  }

  const now = new Date();
  const familyExpiresAt = existing.familyExpiresAt;
  if (existing.deviceId !== device.id) {
    await revokeFamily(existing.familyId, SessionRevocationReason.DEVICE_MISMATCH, now);
    return { ok: false, reason: "device_mismatch" };
  }

  if (existing.revokedAt || existing.replacedBySessionId) {
    if (
      existing.replacedBySessionId ||
      existing.revocationReason === SessionRevocationReason.ROTATED ||
      existing.revocationReason === SessionRevocationReason.REUSE_DETECTED
    ) {
      await revokeFamily(existing.familyId, SessionRevocationReason.REUSE_DETECTED, now);
      return { ok: false, reason: "reused" };
    }
    return { ok: false, reason: "invalid" };
  }

  if (existing.expiresAt <= now || familyExpiresAt <= now) {
    await revokeFamily(existing.familyId, SessionRevocationReason.EXPIRED, now);
    return { ok: false, reason: "expired" };
  }

  const nextRefreshToken = newRefreshToken();
  try {
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.session.updateMany({
        where: {
          id: existing.id,
          clientKind: SessionClientKind.IOS,
          revokedAt: null,
          replacedBySessionId: null,
          expiresAt: { gt: now },
        },
        data: {
          revokedAt: now,
          revocationReason: SessionRevocationReason.ROTATED,
          lastUsedAt: now,
        },
      });
      if (claimed.count !== 1) {
        throw new NativeSessionClaimLost();
      }

      const replacement = await tx.session.create({
        data: {
          userId: existing.userId,
          tokenHash: hashRefreshToken(nextRefreshToken),
          expiresAt: familyExpiresAt,
          clientKind: SessionClientKind.IOS,
          familyId: existing.familyId,
          familyExpiresAt,
          deviceId: device.id,
          deviceName: device.name,
          appVersion: device.appVersion,
          platformVersion: device.platformVersion,
          lastUsedAt: now,
        },
      });

      await tx.session.update({
        where: { id: existing.id },
        data: { replacedBySessionId: replacement.id },
      });
    });
  } catch (cause) {
    if (cause instanceof NativeSessionClaimLost) {
      await revokeFamily(existing.familyId, SessionRevocationReason.REUSE_DETECTED, now);
      return { ok: false, reason: "reused" };
    }
    throw cause;
  }

  return {
    ok: true,
    user: existing.user,
    credentials: {
      refreshToken: nextRefreshToken,
      refreshExpiresAt: familyExpiresAt.toISOString(),
    },
  };
}

export async function revokeNativeSession(
  refreshToken: string,
  pushToken?: string,
): Promise<void> {
  const existing = await prisma.session.findUnique({
    where: { tokenHash: hashRefreshToken(refreshToken) },
    select: { familyId: true, clientKind: true, userId: true },
  });
  if (existing?.clientKind === SessionClientKind.IOS && existing.familyId) {
    await Promise.all([
      revokeFamily(existing.familyId, SessionRevocationReason.LOGOUT),
      pushToken
        ? prisma.nativePushDevice.deleteMany({
            where: { userId: existing.userId, token: pushToken },
          })
        : Promise.resolve(),
    ]);
  }
}

export type NativeDeviceSession = {
  familyId: string;
  deviceId: string;
  deviceName: string;
  appVersion: string;
  platformVersion: string;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
};

export async function listNativeDeviceSessions(userId: string): Promise<NativeDeviceSession[]> {
  const now = new Date();
  const sessions = await prisma.session.findMany({
    where: {
      userId,
      clientKind: SessionClientKind.IOS,
      revokedAt: null,
      familyId: { not: null },
      familyExpiresAt: { gt: now },
    },
    orderBy: { lastUsedAt: "desc" },
    select: {
      familyId: true,
      deviceId: true,
      deviceName: true,
      appVersion: true,
      platformVersion: true,
      createdAt: true,
      lastUsedAt: true,
      familyExpiresAt: true,
    },
  });

  return sessions.flatMap((session) =>
    session.familyId &&
    session.deviceId &&
    session.deviceName &&
    session.appVersion &&
    session.platformVersion &&
    session.familyExpiresAt
      ? [
          {
            familyId: session.familyId,
            deviceId: session.deviceId,
            deviceName: session.deviceName,
            appVersion: session.appVersion,
            platformVersion: session.platformVersion,
            createdAt: session.createdAt.toISOString(),
            lastUsedAt: session.lastUsedAt.toISOString(),
            expiresAt: session.familyExpiresAt.toISOString(),
          },
        ]
      : [],
  );
}

export async function revokeNativeDeviceSession(userId: string, familyId: string): Promise<boolean> {
  const now = new Date();
  const result = await prisma.session.updateMany({
    where: {
      userId,
      familyId,
      clientKind: SessionClientKind.IOS,
      revokedAt: null,
    },
    data: {
      revokedAt: now,
      revocationReason: SessionRevocationReason.USER_REVOKED,
      lastUsedAt: now,
    },
  });
  return result.count > 0;
}
