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
import { MePageSection } from "@/components/profile/me-page-section";
import { profileSectionLabelClassName } from "@/lib/ui/profile-section-label";
import { cn } from "@/lib/utils";

type ProfileValues = z.infer<typeof profileSchema>;

function languageTagOrderIndex(tag: LanguageTag): number {
  const i = LANGUAGE_TAG_OPTIONS.findIndex((o) => o.value === tag);
  return i === -1 ? 999 : i;
}

/** School/program row controls — soft border, warm fill, blue focus ring. */
const settingsControlClass =
  "box-border h-11 min-h-11 w-full rounded-[20px] border border-classmates-edge bg-classmates-warm-alt px-3.5 py-0 text-[14px] leading-snug text-foreground shadow-none transition-[border-color,box-shadow,background-color] placeholder:text-muted-foreground/60 focus:border-classmates-azure focus:bg-classmates-surface focus:outline-none focus:ring-[3px] focus:ring-classmates-azure/25 focus-visible:border-classmates-azure focus-visible:bg-classmates-surface focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-classmates-azure/25 dark:border-border dark:bg-background/70 dark:focus:bg-card dark:focus-visible:bg-card";

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
}: {
  initialValues: ProfileValues;
  submitLabel: string;
  avatarId: string | null;
  /** When set, rendered in its own “Verified email” card after Languages (Me /profile). */
  verificationSlot?: React.ReactNode;
  onSaved?: () => void;
  variant?: "full" | "academicOnly" | "sheet";
  requireDirtyToSubmit?: boolean;
  mePageStructure?: boolean;
}) {
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
      setServerError(payload.error ?? "Unable to save profile.");
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
    ? "Saving…"
    : justSaved
      ? "Saved"
      : requireDirtyToSubmit && !isDirty
        ? "No changes to save"
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
    if (!languagePickerOpen) {
      setLanguageSearch("");
      return;
    }
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [languagePickerOpen]);

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
        mePageStructure && !isSheet ? "space-y-8" : "space-y-5",
        isSheet &&
          "space-y-0 rounded-2xl border border-classmates-edge bg-classmates-surface p-4 shadow-[0_4px_14px_rgba(15,23,42,0.04)] sm:p-5 dark:border-border dark:bg-card",
      )}
      onSubmit={onSubmit}
    >
      {isSheet ? (
        <div className="space-y-3">
          <h2 id="profile-sheet-card-heading" className="sr-only">
            {"Profile photo and tagline"}
          </h2>
          <AvatarPicker initialId={avatarId} sheet>
            <Input
              {...register("nickname")}
              placeholder="Display name"
              className="h-[3.25rem] rounded-[20px] px-3.5 text-[14px] leading-tight"
            />
          </AvatarPicker>
          <FormMessage message={errors.nickname?.message} />
          <div className="space-y-1">
            <Textarea
              {...register("bio")}
              placeholder="Tagline — one short line"
              rows={2}
              className="resize-none rounded-[20px] text-[14px] leading-relaxed"
            />
            <FormMessage message={errors.bio?.message} />
          </div>
        </div>
      ) : null}

      <MeAcademicShell mePageStructure={mePageStructure && !isSheet}>
      {isSheet ? (
        <div className="border-t border-classmates-hairline pt-5 dark:border-border/60" aria-hidden />
      ) : null}
      <div className={cn("space-y-2", isSheet && "space-y-0")}>
        <h2
          id="profile-school-program-heading"
          className={cn(
            profileSectionLabelClassName,
            (mePageStructure && !isSheet) || isSheet ? "sr-only" : "",
          )}
        >
          {"School & Program"}
        </h2>
        <section
          aria-labelledby="profile-school-program-heading"
          className={cn(
            isCompactAcademic ? "space-y-3" : "space-y-5",
            sheetSectionSurface &&
              "rounded-2xl border border-classmates-edge bg-classmates-surface p-4 shadow-[0_4px_14px_rgba(15,23,42,0.04)] sm:p-5 dark:border-border dark:bg-card",
            isSheet && "border-0 bg-transparent p-0 shadow-none",
          )}
        >
          {variant === "full" ? (
            <p className="max-w-md border-b border-classmates-hairline pb-3 text-[13px] leading-snug text-classmates-sub dark:border-border/70 dark:text-zinc-400">
              Used to recommend classmates and courses.
            </p>
          ) : null}
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <div className="flex flex-col gap-1">
            <FieldLabel>School</FieldLabel>
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
            <FieldLabel>Degree</FieldLabel>
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
            <FieldLabel>Major</FieldLabel>
            <Input
              list="profile-major-suggestions"
              autoComplete="off"
              spellCheck={false}
              placeholder="Your major"
              className={settingsControlClass}
              {...register("major")}
            />
            <datalist id="profile-major-suggestions">
              {majorOptions.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
            {variant === "full" ? (
              <p className="text-[11px] leading-snug text-classmates-hint dark:text-zinc-500">Free text is okay.</p>
            ) : null}
            <FormMessage message={errors.major?.message} />
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel>Semester</FieldLabel>
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
        <label className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-background/60 px-3 py-2.5">
          <span className="min-w-0">
            <span className="block text-[13px] font-medium text-foreground">Hide me in course classmates</span>
            <span className="mt-0.5 block text-[11px] text-muted-foreground">
              Others won&apos;t see you in course member lists.
            </span>
          </span>
          <input
            type="checkbox"
            className="h-4 w-4 shrink-0 rounded border-border text-primary accent-primary"
            {...register("hideFromCourseMembers")}
          />
        </label>
        </section>
      </div>

      {isSheet ? (
        <div className="border-t border-classmates-hairline pt-5 dark:border-border/60" aria-hidden />
      ) : null}
      <div className={cn("space-y-2", isCompactAcademic && !isSheet && "space-y-1", isSheet && "space-y-0")}>
        <h2
          id="profile-languages-heading"
          className={cn(profileSectionLabelClassName, (isCompactAcademic || isSheet) && "sr-only")}
        >
          Languages
        </h2>
        <section
          aria-labelledby="profile-languages-heading"
          className={cn(
            sheetSectionSurface &&
              "rounded-2xl border border-classmates-edge bg-classmates-surface shadow-[0_4px_14px_rgba(15,23,42,0.04)] dark:border-border dark:bg-card",
            isCompactAcademic && !isSheet
              ? "space-y-2 p-3"
              : !isSheet
                ? "space-y-3 p-4 sm:p-5"
                : "space-y-2 border-0 bg-transparent p-0 shadow-none",
          )}
        >
          {variant === "full" ? (
            <p className="border-b border-classmates-hairline pb-4 text-[13px] leading-snug text-classmates-sub dark:border-border/70 dark:text-zinc-400">
              What you speak — helps match you with classmates.
            </p>
          ) : null}

        <div className={cn("space-y-3 pt-1", isCompactAcademic && "space-y-2 pt-0")}>
          {sortedSelectedLanguages.length === 0 ? (
            <p
              className={cn(
                "text-muted-foreground",
                isCompactAcademic ? "text-[12px] leading-snug" : "text-[13px]",
              )}
            >
              {isCompactAcademic ? "Add at least one language." : "Add at least one language to continue."}
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
                          aria-label={`${label} proficiency`}
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
                        title={canRemove ? "Remove this language" : "Keep at least one language"}
                        aria-label={canRemove ? `Remove ${label}` : "Cannot remove last language"}
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
                          aria-label={`${label} proficiency`}
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
                        title={canRemove ? "Remove this language" : "Keep at least one language"}
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
                        Remove
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
              Add language
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
            {"Verified Email"}
          </h2>
          <section
            aria-labelledby="profile-verified-email-heading"
            className="space-y-3 rounded-2xl border border-classmates-edge bg-classmates-surface p-4 shadow-[0_4px_14px_rgba(15,23,42,0.04)] sm:p-5 dark:border-border dark:bg-card"
          >
            {mePageStructure ? null : (
              <p className="border-b border-classmates-hairline pb-4 text-[13px] leading-snug text-classmates-sub dark:border-border/70 dark:text-zinc-400">
                Your school inbox — unlocks invitations and shows classmates you&apos;re verified.
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
      >
        <div
          className="flex h-full min-h-0 max-h-[88dvh] flex-col overflow-hidden sm:max-h-none"
          style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
        >
          <div className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-muted" aria-hidden />
          <div className="shrink-0 border-b border-border px-4 py-3 text-center">
            <h2 id="language-picker-title" className="text-[16px] font-semibold text-foreground">
              Add language
            </h2>
            <p className="mt-1 text-[12px] text-muted-foreground">Search and tap to add. You can set level on the form.</p>
          </div>
          <div className="shrink-0 px-4 pt-3">
            <Input
              value={languageSearch}
              onChange={(e) => setLanguageSearch(e.target.value)}
              placeholder="Search languages…"
              autoComplete="off"
              className="h-11 rounded-[20px] border-border bg-muted/40 text-[15px]"
              autoFocus
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2 pt-2">
              {unselectedMain.length === 0 && !unselectedOtherVisible ? (
                <p className="px-2 py-6 text-center text-[13px] text-muted-foreground">No matches.</p>
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
                        Other
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
                        Use when your language is not listed above.
                      </p>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          <div className="shrink-0 border-t border-border px-4 pt-3">
            <Button type="button" className="w-full rounded-full" onClick={() => setLanguagePickerOpen(false)}>
              Done
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
            {"Contact (optional)"}
          </h2>
          <section
            aria-labelledby="profile-contact-heading"
            className="rounded-2xl border border-classmates-edge bg-classmates-surface p-3 shadow-[0_4px_14px_rgba(15,23,42,0.04)] dark:border-border dark:bg-card"
          >
            <p className="mb-3 border-b border-classmates-hairline pb-3 text-[12px] text-classmates-sub dark:border-border/70">
              Shown only if you opt in elsewhere in the app.
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
            {"Home & profile"}
          </h2>
          <section
            aria-labelledby="profile-home-heading"
            className="space-y-3 rounded-2xl border border-classmates-edge bg-classmates-surface p-3 shadow-[0_4px_14px_rgba(15,23,42,0.04)] dark:border-border dark:bg-card"
          >
            <p className="border-b border-classmates-hairline pb-3 text-[12px] text-classmates-sub dark:border-border/70">
              Avatar, name, and tagline — also shown to classmates.
            </p>
            <AvatarPicker initialId={avatarId}>
              <Input {...register("nickname")} placeholder="Nickname" />
              <FormMessage message={errors.nickname?.message} />
            </AvatarPicker>
            <div className="space-y-1">
              <Textarea
                {...register("bio")}
                placeholder="Tagline — one short line, like a status or signature"
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
  if (!mePageStructure) {
    return <>{children}</>;
  }
  return (
    <MePageSection
      id="me-academic-heading"
      title="Academic profile"
      description="School, program, languages, and verified student email."
    >
      <div className="space-y-5">{children}</div>
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
