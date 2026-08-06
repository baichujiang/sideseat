/**
 * App Store Connect API key presence for StoreKit Server API verification.
 * Full lookup lives in `storekit-apple-verify.ts`.
 */
export function isStoreKitAppleApiConfigured(): boolean {
  return Boolean(
    process.env.STOREKIT_APPLE_ISSUER_ID?.trim() &&
      process.env.STOREKIT_APPLE_KEY_ID?.trim() &&
      process.env.STOREKIT_APPLE_PRIVATE_KEY?.trim(),
  );
}
