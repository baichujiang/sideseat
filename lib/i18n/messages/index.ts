/**
 * App UI strings (see `AppMessages` in `./types`). Tab shell + primary surfaces are wired;
 * deeper drill-ins (admin tools copy, some form validators) may still be English-only.
 * Course titles/codes from the API are intentionally not translated here — render DB values as-is.
 */
import type { AppLocale } from "../app-locale";
import { enMessages } from "./en";
import type { AppMessages } from "./types";
import { zhCnMessages } from "./zh-CN";

const byLocale: Record<AppLocale, AppMessages> = {
  en: enMessages,
  "zh-CN": zhCnMessages,
};

export type { AppMessages, CoursesMessages } from "./types";

export function getMessages(locale: AppLocale): AppMessages {
  return byLocale[locale] ?? enMessages;
}

/** Replace `{count}`-style placeholders in a string. */
export function formatMessage(
  template: string | undefined | null,
  vars: Record<string, string | number>,
): string {
  if (typeof template !== "string") return "";
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? ""));
}
