import { cookies } from "next/headers";

import { APP_LOCALE_COOKIE, parseAppLocale, type AppLocale } from "./app-locale";

export async function getServerAppLocale(): Promise<AppLocale> {
  const jar = await cookies();
  return parseAppLocale(jar.get(APP_LOCALE_COOKIE)?.value);
}
