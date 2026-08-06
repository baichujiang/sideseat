import "server-only";

import { SignJWT, importPKCS8 } from "jose";

import { isStoreKitAppleApiConfigured } from "@/lib/api/v1/storekit-apple-env";
import { STOREKIT_BUNDLE_ID } from "@/lib/api/v1/storekit-catalog";

export { isStoreKitAppleApiConfigured };

function normalizeApplePrivateKey(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.includes("BEGIN PRIVATE KEY")) {
    return trimmed.replace(/\\n/g, "\n");
  }
  const body = trimmed.replace(/\s+/g, "");
  const lines = body.match(/.{1,64}/g) ?? [body];
  return `-----BEGIN PRIVATE KEY-----\n${lines.join("\n")}\n-----END PRIVATE KEY-----`;
}

async function createAppStoreServerToken(): Promise<string> {
  const issuerId = process.env.STOREKIT_APPLE_ISSUER_ID!.trim();
  const keyId = process.env.STOREKIT_APPLE_KEY_ID!.trim();
  const privateKey = await importPKCS8(
    normalizeApplePrivateKey(process.env.STOREKIT_APPLE_PRIVATE_KEY!),
    "ES256",
  );
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    bid: STOREKIT_BUNDLE_ID,
  })
    .setProtectedHeader({ alg: "ES256", kid: keyId, typ: "JWT" })
    .setIssuer(issuerId)
    .setIssuedAt(now)
    .setExpirationTime(now + 20 * 60)
    .setAudience("appstoreconnect-v1")
    .sign(privateKey);
}

function appStoreServerHost(environment: string): string {
  if (environment === "Production") {
    return "https://api.storekit.itunes.apple.com";
  }
  return "https://api.storekit-sandbox.itunes.apple.com";
}

export type AppleTransactionLookup = {
  transactionId: string;
  originalTransactionId: string;
  bundleId: string;
  productId: string;
  purchaseDate: Date;
  environment: string;
};

/**
 * Looks up a transaction via App Store Server API.
 * Throws Error with message suitable for StoreKitServiceError wrapping.
 */
export async function lookupAppleTransaction(options: {
  transactionId: string;
  environmentHint: string;
}): Promise<AppleTransactionLookup> {
  if (!isStoreKitAppleApiConfigured()) {
    throw new Error("StoreKit Apple API credentials are not configured.");
  }

  const token = await createAppStoreServerToken();
  const hosts =
    options.environmentHint === "Production"
      ? [appStoreServerHost("Production"), appStoreServerHost("Sandbox")]
      : [appStoreServerHost("Sandbox"), appStoreServerHost("Production")];

  let lastError = "Apple transaction lookup failed.";
  for (const host of hosts) {
    const response = await fetch(`${host}/inApps/v1/transactions/${options.transactionId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });
    if (response.status === 404) {
      lastError = "Apple could not find that transaction.";
      continue;
    }
    if (!response.ok) {
      lastError = `Apple StoreKit API returned HTTP ${response.status}.`;
      continue;
    }
    const payload = (await response.json()) as { signedTransactionInfo?: string };
    if (!payload.signedTransactionInfo) {
      lastError = "Apple StoreKit API response was missing signedTransactionInfo.";
      continue;
    }
    return decodeAppleSignedTransactionPayload(payload.signedTransactionInfo);
  }
  throw new Error(lastError);
}

function decodeAppleSignedTransactionPayload(jws: string): AppleTransactionLookup {
  const parts = jws.split(".");
  if (parts.length < 2) {
    throw new Error("Apple signedTransactionInfo was malformed.");
  }
  const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const json = Buffer.from(padded, "base64").toString("utf8");
  const payload = JSON.parse(json) as Record<string, unknown>;
  const purchaseDateMs = Number(payload.purchaseDate);
  return {
    transactionId: String(payload.transactionId ?? ""),
    originalTransactionId: String(payload.originalTransactionId ?? payload.transactionId ?? ""),
    bundleId: String(payload.bundleId ?? ""),
    productId: String(payload.productId ?? ""),
    purchaseDate: new Date(Number.isFinite(purchaseDateMs) ? purchaseDateMs : Date.now()),
    environment: String(payload.environment ?? "Sandbox"),
  };
}
