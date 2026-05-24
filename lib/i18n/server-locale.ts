import { cache } from "react";
import { cookies } from "next/headers";

import { APP_LOCALE_COOKIE, parseAppLocale, type AppLocale } from "./app-locale";

export const getServerAppLocale = cache(async function getServerAppLocale(): Promise<AppLocale> {
  const jar = await cookies();
  return parseAppLocale(jar.get(APP_LOCALE_COOKIE)?.value);
});
