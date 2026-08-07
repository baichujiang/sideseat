/**
 * APNs Auth Key (.p8) credentials. When all are set, `apnsDelivery` is true and
 * `notifyUserPush` will attempt HTTP/2 delivery to stored NativePushDevice tokens.
 */
export function isApnsConfigured(): boolean {
  return Boolean(
    process.env.APNS_KEY_ID?.trim() &&
      process.env.APNS_TEAM_ID?.trim() &&
      process.env.APNS_KEY_P8?.trim() &&
      (process.env.APNS_BUNDLE_ID?.trim() || "app.sideseat.mobile"),
  );
}

export function apnsBundleId(): string {
  return process.env.APNS_BUNDLE_ID?.trim() || "app.sideseat.mobile";
}

export const apnsEnvironments = ["sandbox", "production"] as const;
export type ApnsEnvironment = (typeof apnsEnvironments)[number];

/** Development-signed apps use sandbox; TestFlight and App Store use production. */
export function apnsUseSandbox(): boolean {
  const flag = process.env.APNS_USE_SANDBOX?.trim();
  if (flag === "1") return true;
  if (flag === "0") return false;
  return process.env.NODE_ENV !== "production";
}

/** Compatibility fallback for clients that registered before environment reporting. */
export function defaultApnsEnvironment(): ApnsEnvironment {
  return apnsUseSandbox() ? "sandbox" : "production";
}

export function normalizeApnsEnvironment(value: string | null | undefined): ApnsEnvironment {
  return value === "sandbox" ? "sandbox" : "production";
}

export function apnsHostForEnvironment(environment: ApnsEnvironment): string {
  return environment === "sandbox"
    ? "api.sandbox.push.apple.com"
    : "api.push.apple.com";
}
