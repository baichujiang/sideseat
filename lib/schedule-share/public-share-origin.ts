const PRODUCTION_SHARE_ORIGIN = "https://www.sideseat.de";

export function publicScheduleShareOrigin(options: {
  requestOrigin: string;
  configuredOrigin?: string | null;
  nodeEnv?: string;
}): string {
  const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV;
  const candidate =
    options.configuredOrigin?.trim() ||
    (nodeEnv === "production" ? PRODUCTION_SHARE_ORIGIN : options.requestOrigin);

  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" && nodeEnv === "production") {
      return PRODUCTION_SHARE_ORIGIN;
    }
    return url.origin;
  } catch {
    return nodeEnv === "production" ? PRODUCTION_SHARE_ORIGIN : options.requestOrigin;
  }
}
