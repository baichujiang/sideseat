"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";

import type { AppLocale } from "@/lib/i18n/app-locale";
import { getMessages, type AppMessages } from "@/lib/i18n/messages";

type LocaleContextValue = {
  locale: AppLocale;
  messages: AppMessages;
  setAppLocale: (next: AppLocale) => Promise<void>;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({
  initialLocale,
  children,
}: {
  initialLocale: AppLocale;
  children: ReactNode;
}) {
  const router = useRouter();
  const [locale, setLocale] = useState<AppLocale>(initialLocale);

  useEffect(() => {
    setLocale(initialLocale);
  }, [initialLocale]);

  const setAppLocale = useCallback(
    async (next: AppLocale) => {
      if (next === locale) return;
      const res = await fetch("/api/locale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: next }),
        credentials: "same-origin",
      });
      if (!res.ok) return;
      router.refresh();
    },
    [locale, router],
  );

  const value = useMemo(
    () => ({
      locale,
      messages: getMessages(locale),
      setAppLocale,
    }),
    [locale, setAppLocale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocaleContext(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error("useLocaleContext must be used within LocaleProvider");
  }
  return ctx;
}
