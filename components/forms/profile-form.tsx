"use client";

import { apiFetch } from "@/lib/auth/api-fetch";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { ChevronDown, Plus, X } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { LanguageProficiency, LanguageTag } from "@prisma/client";

import { AvatarPicker } from "@/components/forms/avatar-picker";
import { AppPushLayer } from "@/components/ui/app-push-layer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormMessage } from "@/components/forms/form-message";
import { schoolOptions } from "@/lib/constants/schools";
import {
  DEGREE_LEVEL_LABELS,
  DEGREE_LEVELS,
  MAJORS_BY_LEVEL,
  semesterOptions,
} from "@/lib/constants/majors";
import {
  LANGUAGE_PROFICIENCY_OPTIONS,
  LANGUAGE_TAG_OPTIONS,
} from "@/lib/constants/languages";
import { profileSchema } from "@/lib/validators/profile";
import { MeDiscoverCitySelect } from "@/components/profile/me-discover-city-select";
import { MePageSection } from "@/components/profile/me-page-section";
import type { DiscoverCityNameKey } from "@/lib/discover/discover-city-name-keys";
import { profileSectionLabelClassName } from "@/lib/ui/profile-section-label";
import { profileSettingsControlClassName } from "@/lib/ui/profile-settings-control";
import { useAppMessages } from "@/hooks/use-app-locale";
import { formatMessage } from "@/lib/i18n/messages";
import { cn } from "@/lib/utils";

type ProfileValues = z.infer<typeof profileSchema>;

function languageTagOrderIndex(tag: LanguageTag): number {
  const i = LANGUAGE_TAG_OPTIONS.findIndex((o) => o.value === tag);
  return i === -1 ? 999 : i;
}

const settingsControlClass = profileSettingsControlClassName;

const settingsSelectClass = cn(settingsControlClass, "cursor-pointer appearance-none pr-10");

export function ProfileForm({
  initialValues,
  submitLabel,
  avatarId,
  verificationSlot,
  onSaved,
  /** `sheet`: Me page bottom sheet — card (avatar/name/bio) first, then school & languages (no verification slot). */
  variant = "full",
  /** When true, Save stays disabled until the user changes something (Me /profile). Onboarding should pass false. */
  requireDirtyToSubmit = true,
  /** Me (`/profile`) layout: grouped sections + push + discover in one form. */
  mePageStructure = false,
  discoverCity,
}: {
  initialValues: ProfileValues;
  submitLabel: string;
  avatarId: string | null;
  /** Discover metro (cookie); shown in Me edit-profile sheet only. */
  discoverCity?: DiscoverCityNameKey;
  /** When set, rendered in its own “Verified email” card after Languages (Me /profile). */
  verificationSlot?: React.ReactNode;
  onSaved?: () => void;
  variant?: "full" | "academicOnly" | "sheet";
  requireDirtyToSubmit?: boolean;
  mePageStructure?: boolean;
}) {
  const { profileForm: pf, profile: pr, common: c } = useAppMessages();
  const router = useRouter();
  const [serverError, setServerError] = useState("");
  const [languagePickerOpen, setLanguagePickerOpen] = useState(false);
  const [languageSearch, setLanguageSearch] = useState("");
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: initialValues,
  });

  const [justSaved, setJustSaved] = useState(false);

  const isSheet = variant === "sheet";
  const isCompactAcademic = variant === "academicOnly" || isSheet;

  useEffect(() => {
    if (isDirty) setJustSaved(false);
  }, [isDirty]);

  useEffect(() => {
    if (!justSaved) return;
    const id = window.setTimeout(() => setJustSaved(false), 2600);
    return () => window.clearTimeout(id);
  }, [justSaved]);

  const onSubmit = handleSubmit(async (values) => {
    setServerError("");

    const response = await apiFetch("/api/profile", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(values),
    });

    const payload = await response.json();

    if (!response.ok) {
      setServerError(payload.error ?? pf.unableToSave);
      return;
    }

    reset(values);
    setJustSaved(true);
    router.refresh();
    onSaved?.();
  });

  /** Block submit while idle-but-pristine, during request, or briefly after success (avoids double POST). */
  const saveDisabled =
    isSubmitting || justSaved || (requireDirtyToSubmit && !isDirty);
  const saveButtonLabel = isSubmitting
    ? pf.saving
    : justSaved
      ? pf.saved
      : requireDirtyToSubmit && !isDirty
        ? pf.noChangesToSave
        : submitLabel;

  const degreeLevel = watch("degreeLevel");
  const semester = watch("semester");
  const currentMajor = watch("major");
  const selectedLanguages = watch("languages") ?? [];
  const selectedTags = new Set(selectedLanguages.map((l) => l.tag));
  const unselectedLanguageOptions = LANGUAGE_TAG_OPTIONS.filter((o) => !selectedTags.has(o.value));
  const sortedSelectedLanguages = useMemo(
    () => [...selectedLanguages].sort((a, b) => languageTagOrderIndex(a.tag) - languageTagOrderIndex(b.tag)),
    [selectedLanguages],
  );

  useEffect(() => {
    if (!languagePickerOpen) setLanguageSearch("");
  }, [languagePickerOpen]);

  // Nested inside `ProfileIdentitySheets` AppPushLayer (`variant="sheet"`): Escape must dismiss
  // only this picker — parent layer's document key listener runs first in bubble order and would
  // close the whole sheet. Capture here so outer handlers never see Escape while open.
  useEffect(() => {
    if (!isSheet || !languagePickerOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      setLanguagePickerOpen(false);
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [isSheet, languagePickerOpen]);

  // Build the major list for the selected degree level. Preserve any legacy
  // free-text major so old rows don't silently get reset to empty.
  const baseMajors = degreeLevel ? MAJORS_BY_LEVEL[degreeLevel] : [];
  const majorOptions =
    currentMajor && baseMajors.length && !baseMajors.includes(currentMajor)
      ? [currentMajor, ...baseMajors]
      : baseMajors;

  const semesterChoices = semesterOptions(degreeLevel);

  // Clamp semester if the user switches to a level with a lower max.
  useEffect(() => {
    if (!degreeLevel) return;
    const max = semesterChoices[semesterChoices.length - 1];
    if (typeof semester === "number" && semester > max) {
      setValue("semester", max, { shouldValidate: true });
    }
  }, [degreeLevel, semester, semesterChoices, setValue]);

  const searchLower = languageSearch.trim().toLowerCase();
  const filterBySearch = (opts: typeof LANGUAGE_TAG_OPTIONS) =>
    opts.filter((o) => !searchLower || o.label.toLowerCase().includes(searchLower));
  const unselectedMain = filterBySearch(unselectedLanguageOptions.filter((o) => o.value !== LanguageTag.OTHER));
  const unselectedOther = unselectedLanguageOptions.find((o) => o.value === LanguageTag.OTHER);
  const unselectedOtherVisible =
    unselectedOther && (!searchLower || unselectedOther.label.toLowerCase().includes(searchLower));

  const languagePickerZ = isSheet ? "z-[60]" : "z-[50]";

  const sheetSectionSurface = !isSheet;

  return (
    <form
      className={cn(
        !isSheet && "space-y-5",
        isSheet &&
          "space-y-0 rounded-2xl border border-classmates-edge bg-classmates-surface p-3 shadow-[0_4px_14px_rgba(15,23,42,0.04)] sm:p-4 dark:border-border dark:bg-card",
      )}
      onSubmit={onSubmit}
    >
      {isSheet ? (
        <div className="space-y-2">
          <h2 id="profile-sheet-card-heading" className="sr-only">
            {pf.sheetCardHeadingSr}
          </h2>
          <AvatarPicker initialId={avatarId} sheet>
            <Input
              {...register("nickname")}
              placeholder={pf.sheetDisplayNamePlaceholder}
              className="h-11 min-h-11 rounded-[20px] px-3.5 text-[14px] leading-tight"
            />
          </AvatarPicker>
          <FormMessage message={errors.nickname?.message} />
          <div className="space-y-1">
            <Textarea
              {...register("bio")}
              placeholder={pf.sheetTaglinePlaceholder}
              rows={2}
              className="resize-none rounded-[20px] py-2.5 text-[14px] leading-snug"
            />
            <FormMessage message={errors.bio?.message} />
          </div>
        </div>
      ) : null}

      <MeAcademicShell mePageStructure={mePageStructure && !isSheet}>
      {isSheet ? (
        <div className="border-t border-classmates-hairline pt-3 dark:border-border/60" aria-hidden />
      ) : null}
      <div className={cn("space-y-2", isSheet && "space-y-0")}>
        <h2
          id="profile-school-program-heading"
          className={cn(
            profileSectionLabelClassName,
            (mePageStructure && !isSheet) || isSheet ? "sr-only" : "",
          )}
        >
          {pf.schoolProgramHeading}
        </h2>
        <section
          aria-labelledby="profile-school-program-heading"
          className={cn(
            isCompactAcademic ? "space-y-2" : "space-y-5",
            sheetSectionSurface &&
              cn(
                "rounded-2xl border border-classmates-edge bg-classmates-surface shadow-[0_4px_14px_rgba(15,23,42,0.04)] dark:border-border dark:bg-card",
                isCompactAcademic ? "p-3 sm:p-4" : "p-4 sm:p-5",
              ),
            isSheet && "border-0 bg-transparent p-0 shadow-none",
          )}
        >
          {variant === "full" ? (
            <p
              className={cn(
                "max-w-md border-b border-classmates-hairline text-[13px] leading-snug text-classmates-sub dark:border-border/70 dark:text-zinc-400",
                isCompactAcademic ? "pb-2" : "pb-3",
              )}
            >
              {pf.recommendClassmatesBlurb}
            </p>
          ) : null}
        {isSheet && discoverCity ? (
          <div
            className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-background/60 px-3 py-2.5"
            title={pr.discoverCityRowSubtitle}
          >
            <span className="shrink-0 text-[13px] font-medium text-foreground">{pr.discoverCityRowTitle}</span>
            <MeDiscoverCitySelect value={discoverCity} variant="pill" />
          </div>
        ) : null}
        <div
          className={cn(
            "grid grid-cols-2",
            isCompactAcademic ? "gap-x-3 gap-y-2" : "gap-x-4 gap-y-3",
          )}
        >
          <div className="flex flex-col gap-1">
            <FieldLabel>{pf.labelSchool}</FieldLabel>
            <div className="relative">
              <select className={settingsSelectClass} {...register("school")}>
                {schoolOptions.map((school) => (
                  <option key={school.value} value={school.value}>
                    {school.shortLabel}
                  </option>
                ))}
              </select>
              <ChevronDown
                className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-classmates-hint dark:text-zinc-500"
                strokeWidth={2}
                aria-hidden
              />
            </div>
            <FormMessage message={errors.school?.message} />
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel>{pf.labelDegree}</FieldLabel>
            <div className="relative">
              <select className={settingsSelectClass} {...register("degreeLevel")}>
                {DEGREE_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {DEGREE_LEVEL_LABELS[level]}
                  </option>
                ))}
              </select>
              <ChevronDown
                className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-classmates-hint dark:text-zinc-500"
                strokeWidth={2}
                aria-hidden
              />
            </div>
            <FormMessage message={errors.degreeLevel?.message} />
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel>{pf.labelMajor}</FieldLabel>
            <div className="relative">
              <select className={settingsSelectClass} {...register("major")}>
                <option value="">{pf.majorNotSpecified}</option>
                {majorOptions.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <ChevronDown
                className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-classmates-hint dark:text-zinc-500"
                strokeWidth={2}
                aria-hidden
              />
            </div>
            <FormMessage message={errors.major?.message} />
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel>{pf.labelSemester}</FieldLabel>
            <div className="relative">
              <select className={settingsSelectClass} {...register("semester", { valueAsNumber: true })}>
                {semesterChoices.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <ChevronDown
                className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-classmates-hint dark:text-zinc-500"
                strokeWidth={2}
                aria-hidden
              />
            </div>
            <FormMessage message={errors.semester?.message} />
          </div>
        </div>
        {/* Gender feature is temporarily disabled in UI; keep current value unchanged. */}
        <input type="hidden" {...register("gender")} />
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {pf.privacyHeading}
          </p>
          <label className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-background/60 px-3 py-2.5">
            <span className="min-w-0">
              <span className="block text-[13px] font-medium text-foreground">{pf.hideFromDiscoveryTitle}</span>
              <span className="mt-0.5 block text-[11px] text-muted-foreground">{pf.hideFromDiscoverySubtitle}</span>
            </span>
            <input
              type="checkbox"
              className="h-4 w-4 shrink-0 rounded border-border text-primary accent-primary"
              {...register("hideFromDiscovery")}
            />
          </label>
          <label className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-background/60 px-3 py-2.5">
            <span className="min-w-0">
              <span className="block text-[13px] font-medium text-foreground">{pf.hideFromRecommendationsTitle}</span>
              <span className="mt-0.5 block text-[11px] text-muted-foreground">
                {pf.hideFromRecommendationsSubtitle}
              </span>
            </span>
            <input
              type="checkbox"
              className="h-4 w-4 shrink-0 rounded border-border text-primary accent-primary"
              {...register("hideFromRecommendations")}
            />
          </label>
          <label className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-background/60 px-3 py-2.5">
            <span className="min-w-0">
              <span className="block text-[13px] font-medium text-foreground">{pf.hideInCourseTitle}</span>
              <span className="mt-0.5 block text-[11px] text-muted-foreground">
                {pf.hideInCourseSubtitle}
              </span>
            </span>
            <input
              type="checkbox"
              className="h-4 w-4 shrink-0 rounded border-border text-primary accent-primary"
              {...register("hideFromCourseMembers")}
            />
          </label>
        </div>
        </section>
      </div>

      {isSheet ? (
        <div className="border-t border-classmates-hairline pt-3 dark:border-border/60" aria-hidden />
      ) : null}
      <div
        className={cn(
          "space-y-2",
          isCompactAcademic && !isSheet && "space-y-1",
          isSheet && "space-y-0",
          isSheet && "mb-6",
        )}
      >
        <h2
          id="profile-languages-heading"
          className={cn(profileSectionLabelClassName, (isCompactAcademic || isSheet) && "sr-only")}
        >
          {pf.languagesHeading}
        </h2>
        <section
          aria-labelledby="profile-languages-heading"
          className={cn(
            sheetSectionSurface &&
              "rounded-2xl border border-classmates-edge bg-classmates-surface shadow-[0_4px_14px_rgba(15,23,42,0.04)] dark:border-border dark:bg-card",
            isCompactAcademic && !isSheet
              ? "space-y-1.5 p-3"
              : !isSheet
                ? "space-y-3 p-4 sm:p-5"
                : "space-y-1.5 border-0 bg-transparent p-0 shadow-none",
          )}
        >
          {variant === "full" ? (
            <p
              className={cn(
                "border-b border-classmates-hairline text-[13px] leading-snug text-classmates-sub dark:border-border/70 dark:text-zinc-400",
                isCompactAcademic ? "pb-2" : "pb-3",
              )}
            >
              {pf.languagesIntroBlurb}
            </p>
          ) : null}

        <div className={cn("space-y-3 pt-1", isCompactAcademic && "space-y-1.5 pt-0", isSheet && "space-y-1.5")}>
          {sortedSelectedLanguages.length === 0 ? (
            <p
              className={cn(
                "text-muted-foreground",
                isCompactAcademic ? "text-[12px] leading-snug" : "text-[13px]",
              )}
            >
              {isCompactAcademic ? pf.addLanguagePrompt : pf.addLanguagePromptContinue}
            </p>
          ) : (
            <ul className={cn(isCompactAcademic ? "space-y-1.5" : "space-y-3")}>
              {sortedSelectedLanguages.map((entry) => {
                const label = LANGUAGE_TAG_OPTIONS.find((o) => o.value === entry.tag)?.label ?? entry.tag;
                const canRemove = selectedLanguages.length > 1;
                if (isCompactAcademic) {
                  return (
                    <li
                      key={entry.tag}
                      className="flex items-center gap-2 rounded-xl border border-border/70 bg-background/60 py-1 pl-2 pr-1.5"
                    >
                      <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-foreground">
                        {label}
                      </span>
                      <div className="relative w-[7.25rem] shrink-0 sm:w-[8rem]">
                        <select
                          className={cn(settingsSelectClass, "h-8 text-[11px] pr-8")}
                          value={entry.proficiency}
                          aria-label={formatMessage(pf.proficiencyAria, { label })}
                          onChange={(e) => {
                            const nextProf = e.target.value as LanguageProficiency;
                            setValue(
                              "languages",
                              selectedLanguages.map((l) =>
                                l.tag === entry.tag ? { ...l, proficiency: nextProf } : l,
                              ),
                              { shouldValidate: true, shouldDirty: true },
                            );
                          }}
                        >
                          {LANGUAGE_PROFICIENCY_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                        <ChevronDown
                          className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-classmates-hint dark:text-zinc-500"
                          strokeWidth={2}
                          aria-hidden
                        />
                      </div>
                      <button
                        type="button"
                        disabled={!canRemove}
                        title={canRemove ? pf.removeLanguageTitle : pf.removeLanguageKeepOneTitle}
                        aria-label={
                          canRemove
                            ? formatMessage(pf.removeLanguageAria, { label })
                            : pf.cannotRemoveLastLanguageAria
                        }
                        onClick={() => {
                          if (!canRemove) return;
                          setValue(
                            "languages",
                            selectedLanguages.filter((l) => l.tag !== entry.tag),
                            { shouldValidate: true, shouldDirty: true },
                          );
                        }}
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground disabled:pointer-events-none disabled:opacity-35"
                      >
                        <X className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </li>
                  );
                }
                return (
                  <li key={entry.tag} className="rounded-[20px] border border-border/70 bg-background/60 px-3 py-2.5">
                    <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                      <span className="min-w-0 flex-1 text-[13px] font-medium text-foreground">{label}</span>
                      <div className="relative w-full sm:w-auto sm:min-w-[10.5rem] sm:max-w-[14rem] sm:flex-1">
                        <select
                          className={cn(settingsSelectClass, "h-9 text-[12px]")}
                          value={entry.proficiency}
                          aria-label={formatMessage(pf.proficiencyAria, { label })}
                          onChange={(e) => {
                            const nextProf = e.target.value as LanguageProficiency;
                            setValue(
                              "languages",
                              selectedLanguages.map((l) =>
                                l.tag === entry.tag ? { ...l, proficiency: nextProf } : l,
                              ),
                              { shouldValidate: true, shouldDirty: true },
                            );
                          }}
                        >
                          {LANGUAGE_PROFICIENCY_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                        <ChevronDown
                          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-classmates-hint dark:text-zinc-500"
                          strokeWidth={2}
                          aria-hidden
                        />
                      </div>
                    </div>
                    <div className="mt-1.5 flex justify-end">
                      <button
                        type="button"
                        disabled={!canRemove}
                        title={canRemove ? pf.removeLanguageTitle : pf.removeLanguageKeepOneTitle}
                        aria-label={
                          canRemove
                            ? formatMessage(pf.removeLanguageAria, { label })
                            : pf.cannotRemoveLastLanguageAria
                        }
                        onClick={() => {
                          if (!canRemove) return;
                          setValue(
                            "languages",
                            selectedLanguages.filter((l) => l.tag !== entry.tag),
                            { shouldValidate: true, shouldDirty: true },
                          );
                        }}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:pointer-events-none disabled:opacity-40"
                      >
                        <X className="h-3 w-3" aria-hidden />
                        {pf.removeLanguage}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {unselectedLanguageOptions.length > 0 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn(
                "w-full rounded-full border-dashed border-border/80 bg-muted/10 font-semibold",
                isCompactAcademic
                  ? "h-8 text-[12px]"
                  : "h-10 text-[13px]",
              )}
              onClick={() => setLanguagePickerOpen(true)}
            >
              <Plus
                className={isCompactAcademic ? "mr-1.5 h-3.5 w-3.5" : "mr-2 h-4 w-4"}
                aria-hidden
              />
              {pf.addLanguage}
            </Button>
          ) : null}
        </div>

        <FormMessage message={errors.languages?.message} />
        </section>
      </div>

      {verificationSlot && !isSheet ? (
        <div className="space-y-2">
          <h2
            id="profile-verified-email-heading"
            className={cn(profileSectionLabelClassName, mePageStructure && "sr-only")}
          >
            {pf.verifiedEmailHeading}
          </h2>
          <section
            aria-labelledby="profile-verified-email-heading"
            className={cn(
              "rounded-2xl border border-classmates-edge bg-classmates-surface shadow-[0_4px_14px_rgba(15,23,42,0.04)] dark:border-border dark:bg-card",
              mePageStructure ? "space-y-2 p-3 sm:p-4" : "space-y-3 p-4 sm:p-5",
            )}
          >
            {mePageStructure ? null : (
              <p className="border-b border-classmates-hairline pb-4 text-[13px] leading-snug text-classmates-sub dark:border-border/70 dark:text-zinc-400">
                {pf.verifiedEmailBlurb}
              </p>
            )}
            <div className={cn(mePageStructure ? "" : "pt-1")}>{verificationSlot}</div>
          </section>
        </div>
      ) : null}
      </MeAcademicShell>

      <AppPushLayer
        open={languagePickerOpen}
        onClose={() => setLanguagePickerOpen(false)}
        zClassName={languagePickerZ}
        panelClassName="w-[min(100vw,28rem)] border-0 bg-background shadow-none dark:shadow-none"
        backdropClassName="bg-black/45 !backdrop-blur-none"
        ariaLabelledBy="language-picker-title"
        lockBodyScroll={!isSheet}
        listenForEscape={!isSheet}
      >
        <div
          className="flex h-full min-h-0 max-h-[88dvh] flex-col overflow-hidden sm:max-h-none"
          style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
        >
          <div className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-muted" aria-hidden />
          <div className="shrink-0 border-b border-border px-4 py-3 text-center">
            <h2 id="language-picker-title" className="text-[16px] font-semibold text-foreground">
              {pf.languagePickerTitle}
            </h2>
            <p className="mt-1 text-[12px] text-muted-foreground">{pf.languagePickerHint}</p>
          </div>
          <div className="shrink-0 px-4 pt-3">
            <Input
              value={languageSearch}
              onChange={(e) => setLanguageSearch(e.target.value)}
              placeholder={pf.searchLanguagesPlaceholder}
              autoComplete="off"
              className="h-11 rounded-[20px] border-border bg-muted/40 text-[15px]"
              autoFocus
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2 pt-2">
              {unselectedMain.length === 0 && !unselectedOtherVisible ? (
                <p className="px-2 py-6 text-center text-[13px] text-muted-foreground">{pf.noLanguageMatches}</p>
              ) : (
                <>
                  <ul className="space-y-0.5">
                    {unselectedMain.map(({ value, label }) => (
                      <li key={value}>
                        <label className="flex cursor-pointer items-center gap-3 rounded-[20px] px-3 py-2.5 text-[14px] active:bg-muted/70">
                          <input
                            type="checkbox"
                            className="h-4 w-4 shrink-0 rounded border-border accent-primary"
                            checked={false}
                            onChange={(e) => {
                              if (!e.target.checked) return;
                              setValue(
                                "languages",
                                [...selectedLanguages, { tag: value, proficiency: LanguageProficiency.FLUENT }],
                                { shouldValidate: true, shouldDirty: true },
                              );
                            }}
                          />
                          <span className="font-medium text-foreground">{label}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                  {unselectedOtherVisible && unselectedOther ? (
                    <div className="mt-3 border-t border-border/60 pt-3">
                      <p className="px-3 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        {pf.otherLanguagesLabel}
                      </p>
                      <label className="flex cursor-pointer items-center gap-3 rounded-[20px] border border-dashed border-border/70 bg-muted/20 px-3 py-2.5 text-[14px] active:bg-muted/50">
                        <input
                          type="checkbox"
                          className="h-4 w-4 shrink-0 rounded border-border accent-primary"
                          checked={false}
                          onChange={(e) => {
                            if (!e.target.checked) return;
                            setValue(
                              "languages",
                              [
                                ...selectedLanguages,
                                { tag: unselectedOther.value, proficiency: LanguageProficiency.FLUENT },
                              ],
                              { shouldValidate: true, shouldDirty: true },
                            );
                          }}
                        />
                        <span className="font-medium text-foreground">{unselectedOther.label}</span>
                      </label>
                      <p className="mt-1.5 px-3 text-[11px] leading-snug text-muted-foreground">
                        {pf.otherLanguageFootnote}
                      </p>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          <div className="shrink-0 border-t border-border px-4 pt-3">
            <Button type="button" className="w-full rounded-full" onClick={() => setLanguagePickerOpen(false)}>
              {c.done}
            </Button>
          </div>
        </div>
      </AppPushLayer>

      {variant === "academicOnly" || isSheet ? (
        <>
          <input type="hidden" {...register("wechatHandle")} />
          <input type="hidden" {...register("whatsappHandle")} />
          <input type="hidden" {...register("telegramHandle")} />
          <input type="hidden" {...register("instagramHandle")} />
          <input type="hidden" {...register("discoverByCourse")} />
          <input type="hidden" {...register("discoverByMajor")} />
          <input type="hidden" {...register("discoverBySemester")} />
          <input type="hidden" {...register("allowInvitationNotes")} />
          <input type="hidden" {...register("contactInfoOptIn")} />
        </>
      ) : (
        <div className="space-y-2">
          <h2 id="profile-contact-heading" className={profileSectionLabelClassName}>
            {pf.contactHeading}
          </h2>
          <section
            aria-labelledby="profile-contact-heading"
            className="rounded-2xl border border-classmates-edge bg-classmates-surface p-3 shadow-[0_4px_14px_rgba(15,23,42,0.04)] dark:border-border dark:bg-card"
          >
            <p className="mb-3 border-b border-classmates-hairline pb-3 text-[12px] text-classmates-sub dark:border-border/70">
              {pf.contactBlurb}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Input {...register("wechatHandle")} placeholder="WeChat" />
              <Input {...register("whatsappHandle")} placeholder="WhatsApp" />
              <Input {...register("telegramHandle")} placeholder="Telegram" />
              <Input {...register("instagramHandle")} placeholder="Instagram" />
            </div>
          </section>
        </div>
      )}

      {variant === "academicOnly" ? (
        <>
          <input type="hidden" {...register("nickname")} />
          <input type="hidden" {...register("bio")} />
        </>
      ) : isSheet ? null : (
        <div className="space-y-2">
          <h2 id="profile-home-heading" className={profileSectionLabelClassName}>
            {pf.homeProfileHeading}
          </h2>
          <section
            aria-labelledby="profile-home-heading"
            className="space-y-3 rounded-2xl border border-classmates-edge bg-classmates-surface p-3 shadow-[0_4px_14px_rgba(15,23,42,0.04)] dark:border-border dark:bg-card"
          >
            <p className="border-b border-classmates-hairline pb-3 text-[12px] text-classmates-sub dark:border-border/70">
              {pf.homeProfileBlurb}
            </p>
            <AvatarPicker initialId={avatarId}>
              <Input {...register("nickname")} placeholder={pf.nicknamePlaceholder} />
              <FormMessage message={errors.nickname?.message} />
            </AvatarPicker>
            <div className="space-y-1">
              <Textarea
                {...register("bio")}
                placeholder={pf.taglinePlaceholderLong}
                rows={2}
              />
              <FormMessage message={errors.bio?.message} />
            </div>
          </section>
        </div>
      )}

      <FormMessage message={serverError} />

      <Button
        type="submit"
        aria-busy={isSubmitting}
        aria-live="polite"
        disabled={saveDisabled}
        className={cn(
          "w-full rounded-full font-semibold",
          justSaved && "border border-emerald-200/90 bg-emerald-50 text-emerald-800 hover:bg-emerald-50/90 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-200",
        )}
      >
        {saveButtonLabel}
      </Button>
    </form>
  );
}

function MeAcademicShell({
  mePageStructure,
  children,
}: {
  mePageStructure: boolean;
  children: React.ReactNode;
}) {
  const { profileForm: pf } = useAppMessages();
  if (!mePageStructure) {
    return <>{children}</>;
  }
  return (
    <MePageSection
      id="me-academic-heading"
      title={pf.academicSectionTitle}
      description={pf.academicSectionDescription}
      density="compact"
    >
      <div className="space-y-3">{children}</div>
    </MePageSection>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="block text-[10px] font-semibold uppercase tracking-[0.1em] text-classmates-hint dark:text-zinc-500">
      {children}
    </span>
  );
}
