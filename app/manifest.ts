import type { MetadataRoute } from "next";

import { APP_NAME } from "@/lib/constants/app";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_NAME,
    short_name: "SideSeat",
    description:
      "Meet classmates through shared courses — chats, plans, and course rooms.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#fef3c7",
    theme_color: "#7c3aed",
    categories: ["education", "social"],
    icons: [
      {
        src: "/icons/app-icon.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/app-icon.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/app-icon.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
