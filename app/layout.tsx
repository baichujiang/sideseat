import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";

import "./globals.css";
import { AuthBootstrap } from "@/components/auth/auth-bootstrap";
import { LocaleProvider } from "@/components/i18n/locale-provider";
import { PwaRegister } from "@/components/pwa/pwa-register";
import { APP_NAME } from "@/lib/constants/app";
import { getServerAppLocale } from "@/lib/i18n/server-locale";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: `${APP_NAME} · Shared context first`,
  description:
    "A calm, privacy-first student connection app for meeting classmates through shared courses.",
  applicationName: APP_NAME,
  appleWebApp: {
    capable: true,
    title: APP_NAME,
    statusBarStyle: "default",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/icons/app-icon.png", sizes: "512x512", type: "image/png" },
      { url: "/icons/app-icon.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/app-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#0f172a" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getServerAppLocale();
  const htmlLang = locale === "zh-CN" ? "zh-CN" : "en";

  return (
    <html lang={htmlLang} className={inter.variable} suppressHydrationWarning>
      <body className="min-h-dvh bg-transparent font-sans text-[15px] leading-relaxed antialiased text-foreground">
        <LocaleProvider initialLocale={locale}>
          {children}
          <AuthBootstrap />
          <PwaRegister />
        </LocaleProvider>
      </body>
    </html>
  );
}
