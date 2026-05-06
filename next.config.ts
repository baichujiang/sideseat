import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  /** Hides the floating dev/build indicator (often mistaken for an in-app “debug” chip). */
  devIndicators: false,
};

export default nextConfig;
