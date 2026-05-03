import { LanguageTag } from "@prisma/client";

/** Legacy users may have an empty array until they save profile once. */
export function coerceProfileLanguages(saved: LanguageTag[]): LanguageTag[] {
  return saved.length > 0 ? [...saved] : [LanguageTag.ENGLISH];
}

/** Stable order for profile checkboxes and filters. */
export const LANGUAGE_TAG_OPTIONS: { value: LanguageTag; label: string }[] = [
  { value: LanguageTag.ENGLISH, label: "English" },
  { value: LanguageTag.GERMAN, label: "German" },
  { value: LanguageTag.FRENCH, label: "French" },
  { value: LanguageTag.SPANISH, label: "Spanish" },
  { value: LanguageTag.CHINESE, label: "Chinese" },
  { value: LanguageTag.HINDI, label: "Hindi" },
  { value: LanguageTag.OTHER, label: "Other" },
];

export const LANGUAGE_TAG_LABEL: Record<LanguageTag, string> = Object.fromEntries(
  LANGUAGE_TAG_OPTIONS.map(({ value, label }) => [value, label]),
) as Record<LanguageTag, string>;
