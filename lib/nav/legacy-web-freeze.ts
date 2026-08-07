const NATIVE_WEB_PATHS = ["/", "/ios", "/privacy", "/support"] as const;
const ADMIN_WEB_PATHS = ["/admin", "/login", "/forgot-password"] as const;

export function isLegacyWebFrozen(
  nodeEnv = process.env.NODE_ENV,
  legacyWebEnabled = process.env.SIDESEAT_ENABLE_LEGACY_WEB,
): boolean {
  return nodeEnv === "production" && legacyWebEnabled !== "true";
}

export function isNativeWebPath(pathname: string): boolean {
  if (
    [...NATIVE_WEB_PATHS, ...ADMIN_WEB_PATHS].some(
      (path) => pathname === path || pathname.startsWith(`${path}/`),
    )
  ) {
    return true;
  }
  return (
    pathname.startsWith("/share/view/") ||
    pathname.startsWith("/.well-known/") ||
    pathname.startsWith("/icons/")
  );
}
