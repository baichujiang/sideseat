export function apnsBundleId(): string {
  return process.env.APNS_BUNDLE_ID?.trim() || "app.sideseat.mobile";
}

export const apnsEnvironments = ["sandbox", "production"] as const;
export type ApnsEnvironment = (typeof apnsEnvironments)[number];

export type ApnsCredentials = Readonly<{
  keyId: string;
  teamId: string;
  keyP8: string;
}>;

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

/**
 * Apple now issues environment-scoped APNs keys. Prefer the matching
 * APNS_SANDBOX_* / APNS_PRODUCTION_* pair. The legacy APNS_KEY_* pair is used
 * only for the environment selected by APNS_USE_SANDBOX, so a sandbox-only key
 * can never accidentally authenticate a TestFlight delivery.
 */
export function apnsCredentialsForEnvironment(
  environment: ApnsEnvironment,
): ApnsCredentials | null {
  const teamId = process.env.APNS_TEAM_ID?.trim();
  const prefix = environment === "sandbox" ? "APNS_SANDBOX" : "APNS_PRODUCTION";
  const keyId = process.env[`${prefix}_KEY_ID`]?.trim();
  const keyP8 = process.env[`${prefix}_KEY_P8`]?.trim();

  if (teamId && keyId && keyP8) {
    return { keyId, teamId, keyP8 };
  }

  if (defaultApnsEnvironment() !== environment) return null;
  const legacyKeyId = process.env.APNS_KEY_ID?.trim();
  const legacyKeyP8 = process.env.APNS_KEY_P8?.trim();
  if (!teamId || !legacyKeyId || !legacyKeyP8) return null;
  return { keyId: legacyKeyId, teamId, keyP8: legacyKeyP8 };
}

/** True when at least one native APNs environment can be delivered. */
export function isApnsConfigured(environment?: ApnsEnvironment): boolean {
  if (environment) return apnsCredentialsForEnvironment(environment) !== null;
  return apnsEnvironments.some((candidate) => apnsCredentialsForEnvironment(candidate) !== null);
}

/** APNs capability flags exposed to native clients and operational diagnostics. */
export function nativeClientApnsFeatures(): Readonly<Record<string, boolean>> {
  const sandbox = isApnsConfigured("sandbox");
  const production = isApnsConfigured("production");
  return {
    // TestFlight and App Store builds always register production device tokens.
    apnsDelivery: production,
    apnsSandboxDelivery: sandbox,
    apnsProductionDelivery: production,
  };
}

export function normalizeApnsEnvironment(value: string | null | undefined): ApnsEnvironment {
  return value === "sandbox" ? "sandbox" : "production";
}

export function apnsHostForEnvironment(environment: ApnsEnvironment): string {
  return environment === "sandbox"
    ? "api.sandbox.push.apple.com"
    : "api.push.apple.com";
}
