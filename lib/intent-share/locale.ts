import type { ShareLocale } from "./copy";

export const SHARE_LOCALE_COOKIE = "sideseat_share_locale";

export function isShareLocale(value: unknown): value is ShareLocale {
  return value === "en" || value === "de" || value === "zh-CN";
}

export function resolveShareLocale({ requested, saved, acceptLanguage }: {
  requested?: string;
  saved?: string;
  acceptLanguage?: string | null;
}): ShareLocale {
  if (isShareLocale(requested)) return requested;
  if (isShareLocale(saved)) return saved;

  const preferences = (acceptLanguage ?? "").split(",").map(entry => {
    const [tag, ...parameters] = entry.trim().split(";");
    const quality = parameters.find(parameter => parameter.trim().startsWith("q="));
    return { tag: tag.toLowerCase(), weight: quality ? Number(quality.trim().slice(2)) : 1 };
  }).filter(preference => preference.weight > 0 && preference.weight <= 1)
    .sort((a, b) => b.weight - a.weight);

  for (const { tag } of preferences) {
    const language = tag.split("-")[0];
    if (language === "zh") return "zh-CN";
    if (language === "de" || language === "en") return language;
  }
  return "en";
}
