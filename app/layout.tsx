import type { Metadata } from "next";
import { Inter } from "next/font/google";

import "./globals.css";
import { APP_NAME } from "@/lib/constants/app";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: `${APP_NAME} · Shared context first`,
  description:
    "A calm, privacy-first student connection app for meeting classmates through shared courses.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-dvh bg-transparent font-sans text-[15px] leading-relaxed antialiased text-foreground">
        {children}
      </body>
    </html>
  );
}
