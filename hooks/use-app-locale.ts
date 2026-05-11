import { useLocaleContext } from "@/components/i18n/locale-provider";

/** UI locale for the signed-in app shell (cookie-backed, see `NEXT_LOCALE`). */
export function useAppLocale() {
  const { locale, setAppLocale } = useLocaleContext();
  return { locale, setLocale: setAppLocale };
}

export function useAppMessages() {
  return useLocaleContext().messages;
}
