import type { AppLocale } from "../app-locale";
import { enMessages } from "./en";
import type { AppMessages } from "./types";
import { zhCnMessages } from "./zh-CN";

const byLocale: Record<AppLocale, AppMessages> = {
  en: enMessages,
  "zh-CN": zhCnMessages,
};

export type { AppMessages } from "./types";

export function getMessages(locale: AppLocale): AppMessages {
  return byLocale[locale] ?? enMessages;
}

/** Replace `{count}`-style placeholders in a string. */
export function formatMessage(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? ""));
}
