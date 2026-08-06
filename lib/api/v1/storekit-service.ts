import "server-only";

import { Prisma } from "@prisma/client";

import {
  STOREKIT_BUNDLE_ID,
  STOREKIT_SUPPORT_PRODUCTS,
  isAllowedStoreKitProductId,
  isStoreKitSupportEnabled,
} from "@/lib/api/v1/storekit-catalog";
import {
  isStoreKitAppleApiConfigured,
  lookupAppleTransaction,
} from "@/lib/api/v1/storekit-apple-verify";
import { prisma } from "@/lib/db/prisma";

export class StoreKitServiceError extends Error {
  constructor(
    readonly code:
      | "FEATURE_UNAVAILABLE"
      | "INVALID_REQUEST"
      | "NOT_FOUND"
      | "CONTENT_RESTRICTED",
    readonly messageText: string,
  ) {
    super(messageText);
    this.name = "StoreKitServiceError";
  }
}

type DecodedTransaction = {
  transactionId: string;
  originalTransactionId: string;
  bundleId: string;
  productId: string;
  purchaseDate: Date;
  environment: string;
};

function isLocalDatabaseUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const host = new URL(value).hostname;
    return host === "127.0.0.1" || host === "localhost" || host === "::1";
  } catch {
    return false;
  }
}

function verificationMode(): "test" | "strict" {
  const configured = process.env.STOREKIT_VERIFICATION_MODE?.trim().toLowerCase();
  if (configured === "test" || configured === "strict") return configured;
  if (isLocalDatabaseUrl(process.env.DATABASE_URL)) return "test";
  return "strict";
}

function decodeBase64UrlJson(segment: string): unknown {
  const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const json = Buffer.from(padded, "base64").toString("utf8");
  return JSON.parse(json) as unknown;
}

function asNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new StoreKitServiceError("INVALID_REQUEST", `Missing transaction field: ${field}.`);
  }
  return value.trim();
}

function parsePurchaseDate(value: unknown): Date {
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
  }
  if (typeof value === "string" && value.trim()) {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber)) {
      const date = new Date(asNumber);
      if (!Number.isNaN(date.getTime())) return date;
    }
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
  }
  throw new StoreKitServiceError("INVALID_REQUEST", "Missing transaction field: purchaseDate.");
}

function decodeSignedTransaction(signedTransaction: string): DecodedTransaction {
  const parts = signedTransaction.split(".");
  if (parts.length !== 3 || parts.some((part) => !part)) {
    throw new StoreKitServiceError("INVALID_REQUEST", "signedTransaction must be a compact JWS.");
  }

  let payload: Record<string, unknown>;
  try {
    const decoded = decodeBase64UrlJson(parts[1]!);
    if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) {
      throw new Error("payload not object");
    }
    payload = decoded as Record<string, unknown>;
  } catch {
    throw new StoreKitServiceError("INVALID_REQUEST", "signedTransaction payload is not valid JSON.");
  }

  const environment = asNonEmptyString(payload.environment, "environment");
  const allowedEnvironments = new Set(["Xcode", "Sandbox", "Production"]);
  if (!allowedEnvironments.has(environment)) {
    throw new StoreKitServiceError("INVALID_REQUEST", "Unsupported StoreKit environment.");
  }

  return {
    transactionId: asNonEmptyString(payload.transactionId, "transactionId"),
    originalTransactionId: asNonEmptyString(
      payload.originalTransactionId ?? payload.transactionId,
      "originalTransactionId",
    ),
    bundleId: asNonEmptyString(payload.bundleId, "bundleId"),
    productId: asNonEmptyString(payload.productId, "productId"),
    purchaseDate: parsePurchaseDate(payload.purchaseDate),
    environment,
  };
}

function assertTransactionAllowed(decoded: DecodedTransaction, mode: "test" | "strict") {
  if (decoded.bundleId !== STOREKIT_BUNDLE_ID) {
    throw new StoreKitServiceError("CONTENT_RESTRICTED", "Bundle ID does not match this app.");
  }
  if (!isAllowedStoreKitProductId(decoded.productId)) {
    throw new StoreKitServiceError("CONTENT_RESTRICTED", "Product ID is not a SideSeat support tier.");
  }
  if (mode === "test") {
    if (decoded.environment === "Production") {
      throw new StoreKitServiceError(
        "CONTENT_RESTRICTED",
        "Production StoreKit transactions are not accepted in test verification mode.",
      );
    }
    return;
  }
}

async function verifyStrictTransaction(
  signedTransaction: string,
  decoded: DecodedTransaction,
): Promise<DecodedTransaction> {
  assertTransactionAllowed(decoded, "strict");
  if (!isStoreKitAppleApiConfigured()) {
    throw new StoreKitServiceError(
      "FEATURE_UNAVAILABLE",
      "StoreKit server verification is not configured for this environment yet.",
    );
  }
  try {
    const apple = await lookupAppleTransaction({
      transactionId: decoded.transactionId,
      environmentHint: decoded.environment,
    });
    if (apple.transactionId !== decoded.transactionId) {
      throw new StoreKitServiceError("CONTENT_RESTRICTED", "Apple transaction ID mismatch.");
    }
    if (apple.bundleId !== STOREKIT_BUNDLE_ID) {
      throw new StoreKitServiceError("CONTENT_RESTRICTED", "Apple bundle ID mismatch.");
    }
    if (!isAllowedStoreKitProductId(apple.productId)) {
      throw new StoreKitServiceError("CONTENT_RESTRICTED", "Apple product ID is not allowed.");
    }
    return {
      transactionId: apple.transactionId,
      originalTransactionId: apple.originalTransactionId,
      bundleId: apple.bundleId,
      productId: apple.productId,
      purchaseDate: apple.purchaseDate,
      environment: apple.environment === "Production" ? "Production" : "Sandbox",
    };
  } catch (cause) {
    if (cause instanceof StoreKitServiceError) throw cause;
    throw new StoreKitServiceError(
      "FEATURE_UNAVAILABLE",
      cause instanceof Error ? cause.message : "Apple StoreKit verification failed.",
    );
  }
}

export function listStoreKitProducts() {
  if (!isStoreKitSupportEnabled()) {
    throw new StoreKitServiceError(
      "FEATURE_UNAVAILABLE",
      "StoreKit support is not enabled for this environment.",
    );
  }
  return {
    bundleId: STOREKIT_BUNDLE_ID,
    finishPath: "app" as const,
    products: STOREKIT_SUPPORT_PRODUCTS.map((product) => ({ ...product })),
  };
}

export async function acknowledgeStoreKitTransaction(options: {
  userId: string;
  signedTransaction: string;
}) {
  if (!isStoreKitSupportEnabled()) {
    throw new StoreKitServiceError(
      "FEATURE_UNAVAILABLE",
      "StoreKit support is not enabled for this environment.",
    );
  }

  const mode = verificationMode();
  const decoded = decodeSignedTransaction(options.signedTransaction);
  const verified =
    mode === "strict"
      ? await verifyStrictTransaction(options.signedTransaction, decoded)
      : (assertTransactionAllowed(decoded, "test"), decoded);

  const existing = await prisma.storeKitTransaction.findUnique({
    where: { transactionId: verified.transactionId },
  });
  if (existing) {
    if (existing.userId !== options.userId) {
      throw new StoreKitServiceError(
        "CONTENT_RESTRICTED",
        "This transaction is already recorded for another account.",
      );
    }
    return {
      acknowledged: true as const,
      alreadyRecorded: true as const,
      finishPath: "app" as const,
      transaction: {
        id: existing.id,
        transactionId: existing.transactionId,
        productId: existing.productId,
        environment: existing.environment,
        purchaseDate: existing.purchaseDate.toISOString(),
        status: existing.status,
      },
    };
  }

  try {
    const created = await prisma.storeKitTransaction.create({
      data: {
        userId: options.userId,
        transactionId: verified.transactionId,
        originalTransactionId: verified.originalTransactionId,
        productId: verified.productId,
        bundleId: verified.bundleId,
        environment: verified.environment,
        purchaseDate: verified.purchaseDate,
        verificationMode: mode,
        status: "VERIFIED",
      },
    });
    return {
      acknowledged: true as const,
      alreadyRecorded: false as const,
      finishPath: "app" as const,
      transaction: {
        id: created.id,
        transactionId: created.transactionId,
        productId: created.productId,
        environment: created.environment,
        purchaseDate: created.purchaseDate.toISOString(),
        status: created.status,
      },
    };
  } catch (cause) {
    if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === "P2002") {
      const raced = await prisma.storeKitTransaction.findUnique({
        where: { transactionId: verified.transactionId },
      });
      if (raced && raced.userId === options.userId) {
        return {
          acknowledged: true as const,
          alreadyRecorded: true as const,
          finishPath: "app" as const,
          transaction: {
            id: raced.id,
            transactionId: raced.transactionId,
            productId: raced.productId,
            environment: raced.environment,
            purchaseDate: raced.purchaseDate.toISOString(),
            status: raced.status,
          },
        };
      }
      throw new StoreKitServiceError(
        "CONTENT_RESTRICTED",
        "This transaction is already recorded for another account.",
      );
    }
    throw cause;
  }
}
