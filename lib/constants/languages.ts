import { LanguageProficiency, LanguageTag } from "@prisma/client";

/** Legacy default when a user has no rows yet (should not happen after migration). */
export function profileLanguagesFormDefault(
  rows: { tag: LanguageTag; proficiency: LanguageProficiency }[],
): { tag: LanguageTag; proficiency: LanguageProficiency }[] {
  if (rows.length === 0) {
    return [{ tag: LanguageTag.ENGLISH, proficiency: LanguageProficiency.FLUENT }];
  }
  return [...rows].sort((a, b) => languageTagSortIndex(a.tag) - languageTagSortIndex(b.tag));
}

function languageTagSortIndex(tag: LanguageTag): number {
  const i = LANGUAGE_TAG_OPTIONS.findIndex((o) => o.value === tag);
  return i === -1 ? 999 : i;
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

export const LANGUAGE_PROFICIENCY_OPTIONS: { value: LanguageProficiency; label: string }[] = [
  { value: LanguageProficiency.NATIVE, label: "Native" },
  { value: LanguageProficiency.FLUENT, label: "Fluent" },
  { value: LanguageProficiency.CONVERSATIONAL, label: "Conversational" },
  { value: LanguageProficiency.BASIC, label: "Basic" },
  { value: LanguageProficiency.LEARNING, label: "Learning" },
];

export const LANGUAGE_PROFICIENCY_LABEL: Record<LanguageProficiency, string> = Object.fromEntries(
  LANGUAGE_PROFICIENCY_OPTIONS.map(({ value, label }) => [value, label]),
) as Record<LanguageProficiency, string>;
