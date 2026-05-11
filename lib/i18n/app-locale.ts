export const APP_LOCALE_COOKIE = "NEXT_LOCALE" as const;

export const APP_LOCALES = ["en", "zh-CN"] as const;

export type AppLocale = (typeof APP_LOCALES)[number];

export const DEFAULT_APP_LOCALE: AppLocale = "en";

export function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === "string" && (APP_LOCALES as readonly string[]).includes(value);
}

export function parseAppLocale(raw: string | undefined | null): AppLocale {
  if (isAppLocale(raw)) return raw;
  return DEFAULT_APP_LOCALE;
}
