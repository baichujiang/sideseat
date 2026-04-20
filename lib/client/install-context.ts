"use client";

import type { ClientContextInput } from "@/lib/validators/client-context";

const INSTALL_ID_KEY = "sideseat.install_id";

type NavigatorWithUAData = Navigator & {
  userAgentData?: {
    platform?: string;
  };
};

function getOrCreateInstallId() {
  const existing = window.localStorage.getItem(INSTALL_ID_KEY);

  if (existing) {
    return existing;
  }

  const nextId = window.crypto.randomUUID();
  window.localStorage.setItem(INSTALL_ID_KEY, nextId);
  return nextId;
}

export function buildClientContext(): ClientContextInput {
  const navigatorWithUAData = navigator as NavigatorWithUAData;

  return {
    installId: getOrCreateInstallId(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || undefined,
    language: navigator.language || undefined,
    platform: navigatorWithUAData.userAgentData?.platform || navigator.platform || undefined,
    screenWidth: window.screen?.width ?? undefined,
    screenHeight: window.screen?.height ?? undefined,
  };
}
