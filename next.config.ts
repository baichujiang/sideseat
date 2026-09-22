import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  // node-ical's Temporal implementation must execute natively in Node; Webpack
  // rewriting it causes BigInt initialization to fail during route collection.
  serverExternalPackages: ["node-ical"],
  /** Hides the floating dev/build indicator (often mistaken for an in-app “debug” chip). */
  devIndicators: false,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.public.blob.vercel-storage.com",
        pathname: "/**",
      },
      /** Dev example cards + `prisma db seed` (`lib/discover/dev-example-classmate-posts.ts`, `prisma/seed.ts`). */
      {
        protocol: "https",
        hostname: "picsum.photos",
        pathname: "/**",
      },
      /** Picsum redirects / CDN (`fastly.picsum.photos`, `www.…`). */
      {
        protocol: "https",
        hostname: "*.picsum.photos",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
