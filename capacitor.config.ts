import type { CapacitorConfig } from "@capacitor/cli";

/**
 * SideSeat uses Next.js (SSR + API routes). The iOS shell loads the deployed app URL
 * in a WKWebView — set CAPACITOR_SERVER_URL when syncing or opening Xcode.
 *
 * Dev (simulator): http://localhost:3000
 * Dev (physical device): http://<your-lan-ip>:3000
 * Production: https://your-production-host
 */
const serverUrl = process.env.CAPACITOR_SERVER_URL?.trim();

const config: CapacitorConfig = {
  appId: "app.sideseat.mobile",
  appName: "SideSeat",
  webDir: "ios-shell/www",
  ios: {
    /** Keep WebView content below status bar / Dynamic Island. */
    contentInset: "always",
    allowsLinkPreview: false,
    scrollEnabled: true,
  },
  server: serverUrl
    ? {
        url: serverUrl,
        cleartext: serverUrl.startsWith("http://"),
        androidScheme: "https",
      }
    : undefined,
  plugins: {
    StatusBar: {
      overlaysWebView: false,
      style: "LIGHT",
    },
    SplashScreen: {
      launchAutoHide: true,
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "banner", "list"],
    },
  },
};

export default config;
