"use client";

import { apiFetch } from "@/lib/auth/api-fetch";

/** Compact rows (onboarding), centered hero, or summary strip + sheets (Me /profile). */

import type { UserGender } from "@prisma/client";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { z } from "zod";

import { AvatarCropEditor } from "@/components/profile/avatar-crop-editor";
import { ProfileForm } from "@/components/forms/profile-form";
import { PresetAvatar } from "@/components/ui/preset-avatar";
import { UserGenderProfileMark } from "@/components/ui/user-gender-icon";
import { AppPushLayer } from "@/components/ui/app-push-layer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AVATAR_IDS, isDisplayableCustomAvatarUrl, isValidAvatarId } from "@/lib/constants/avatars";
import { uploadProfileAvatarPhoto } from "@/lib/profile/upload-avatar";
import { mePageCardClass } from "@/components/profile/me-settings-row";
import type { DiscoverCityNameKey } from "@/lib/discover/discover-city-name-keys";
import { cn } from "@/lib/utils";
import { formatMessage } from "@/lib/i18n/messages";
import { useAppMessages } from "@/hooks/use-app-locale";
import { homeProfileQuickSchema, profileSchema } from "@/lib/validators/profile";

type Sheet = null | "edit" | "avatar" | "name" | "bio";
type SheetProfileValues = z.infer<typeof profileSchema>;

const ROW =
  "flex min-h-[3.25rem] w-full items-center justify-between gap-3 px-4 py-3 text-left active:bg-muted/70";

const SAVE_RED = "bg-[#ff2442] text-white hover:bg-[#e61e3a]";

/** Matches `BackLink` pill — sheets use a button instead of routing. */
const SHEET_BACK_BTN_CLASS =
  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#E7E0D6] bg-white text-foreground shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors hover:border-[#D4C9BA] hover:bg-[#FAF8F5] active:bg-[#F3EFE8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 dark:border-border dark:bg-card dark:shadow-none dark:hover:bg-muted/60 dark:active:bg-muted/80 dark:focus-visible:ring-blue-400/40";

function SheetScreenHeader({
  title,
  onBack,
  disabled,
  backAriaLabel,
}: {
  title: string;
  onBack: () => void;
  disabled?: boolean;
  backAriaLabel: string;
}) {
  return (
    <header className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2.5">
      <button type="button" aria-label={backAriaLabel} disabled={disabled} onClick={onBack} className={SHEET_BACK_BTN_CLASS}>
        <ChevronLeft className="h-5 w-5" strokeWidth={2.25} aria-hidden />
      </button>
      <h2 className="min-w-0 flex-1 truncate text-[15px] font-semibold leading-tight text-foreground">{title}</h2>
    </header>
  );
}

const heroCardClass =
  "relative overflow-hidden rounded-2xl border border-classmates-edge bg-classmates-surface shadow-[0_4px_16px_rgba(15,23,42,0.05)] dark:border-border dark:bg-card";

export type ProfileSchoolSummary = {
  schoolShort: string;
  degreeLabel: string;
  major: string;
  semester: number;
};

function buildSchoolSubtitle(summary: ProfileSchoolSummary, semesterLabel: string): string {
  const majorOrDegree = summary.major.trim() || summary.degreeLabel;
  const sem = formatMessage(semesterLabel, { semester: String(summary.semester) });
  return [summary.schoolShort, majorOrDegree, sem].join(" · ");
}

export function ProfileIdentitySheets({
  initialNickname,
  initialBio,
  initialAvatarUrl,
  variant = "compact",
  schoolSummary,
  gender,
  /** When set (Me /profile summary), the edit sheet uses one `ProfileForm` for card + academic fields. */
  sheetProfileInitialValues,
  sheetProfileFormKey,
  belowDisplayName,
  discoverCity,
}: {
  initialNickname: string | null;
  initialBio: string | null;
  initialAvatarUrl: string | null;
  variant?: "compact" | "hero" | "summary";
  schoolSummary?: ProfileSchoolSummary | null;
  /** Own profile — shown on hero/summary card next to name. */
  gender?: UserGender | null;
  sheetProfileInitialValues?: SheetProfileValues;
  sheetProfileFormKey?: string;
  /** Me /profile summary only — e.g. private self-chat title under the display name. */
  belowDisplayName?: ReactNode;
  discoverCity?: DiscoverCityNameKey;
}) {
  const t = useAppMessages().meIdentity;
  const crop = useAppMessages().meAvatarCrop;
  const common = useAppMessages().common;
  const pf = useAppMessages().profileForm;
  const router = useRouter();
  const avatarUploadInputRef = useRef<HTMLInputElement>(null);
  const avatarUploadTargetRef = useRef<"edit" | "sheet">("sheet");
  const [sheet, setSheet] = useState<Sheet>(null);
  const [nickname, setNickname] = useState(initialNickname?.trim() ?? "");
  const [bio, setBio] = useState(initialBio ?? "");
  const [avatarId, setAvatarId] = useState<string | null>(initialAvatarUrl);
  const [draftName, setDraftName] = useState("");
  const [draftBio, setDraftBio] = useState("");
  const [draftAvatarId, setDraftAvatarId] = useState<string | null>(null);
  const [avatarAtEditOpen, setAvatarAtEditOpen] = useState<string | null>(null);
  const [avatarReturnToEdit, setAvatarReturnToEdit] = useState(false);
  const [avatarCropFile, setAvatarCropFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setNickname(initialNickname?.trim() ?? "");
    setBio(initialBio ?? "");
    setAvatarId(initialAvatarUrl);
  }, [initialNickname, initialBio, initialAvatarUrl]);

  useEffect(() => {
    setError("");
  }, [sheet]);

  const openName = () => {
    setDraftName(nickname.trim() || "");
    setSheet("name");
  };

  const openBio = () => {
    setDraftBio(bio);
    setSheet("bio");
  };

  const openEditProfile = () => {
    setDraftName(nickname.trim() || "");
    setDraftBio(bio);
    const initialA = avatarId ?? AVATAR_IDS[0] ?? null;
    setDraftAvatarId(initialA);
    setAvatarAtEditOpen(avatarId);
    setError("");
    setSheet("edit");
  };

  const patchQuick = useCallback(async (body: { nickname?: string; bio?: string }) => {
    const res = await apiFetch("/api/profile/quick", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok || !payload.success) {
      throw new Error(typeof payload.error === "string" ? payload.error : t.errorCouldNotSave);
    }
    router.refresh();
  }, [router, t]);

  const postAvatar = useCallback(async (id: string) => {
    const res = await apiFetch("/api/profile/avatar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ avatarId: id }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok || !payload.success) {
      throw new Error(typeof payload.error === "string" ? payload.error : t.errorCouldNotUpload);
    }
  }, [t]);

  const runAvatarUpload = useCallback(
    (file: File, mode: "edit" | "sheet") => {
      setError("");
      startTransition(async () => {
        try {
          const url = await uploadProfileAvatarPhoto(file);
          if (mode === "edit") {
            setDraftAvatarId(url);
            setAvatarAtEditOpen(url);
          }
          setAvatarId(url);
          if (mode === "sheet") setSheet(null);
          router.refresh();
        } catch (e) {
          setError(e instanceof Error ? e.message : t.errorCouldNotUpload);
        }
      });
    },
    [router, t],
  );

  const saveName = () => {
    setError("");
    const parsed = homeProfileQuickSchema.shape.nickname.safeParse(draftName.trim());
    if (!parsed.success) {
      setError(parsed.error.errors[0]?.message ?? t.errorInvalidName);
      return;
    }
    startTransition(async () => {
      try {
        await patchQuick({ nickname: parsed.data });
        setNickname(parsed.data);
        setSheet(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : t.errorCouldNotSave);
      }
    });
  };

  const saveBio = () => {
    setError("");
    const parsed = homeProfileQuickSchema.shape.bio.safeParse(draftBio.trim() === "" ? "" : draftBio.trim());
    if (!parsed.success) {
      setError(parsed.error.errors[0]?.message ?? t.errorInvalidBio);
      return;
    }
    startTransition(async () => {
      try {
        await patchQuick({ bio: parsed.data });
        const nextBio = parsed.data ?? "";
        setBio(nextBio);
        setSheet(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : t.errorCouldNotSave);
      }
    });
  };

  const saveEditProfile = () => {
    setError("");
    const parsedName = homeProfileQuickSchema.shape.nickname.safeParse(draftName.trim());
    if (!parsedName.success) {
      setError(parsedName.error.errors[0]?.message ?? t.errorInvalidName);
      return;
    }
    const parsedBio = homeProfileQuickSchema.shape.bio.safeParse(draftBio.trim() === "" ? "" : draftBio.trim());
    if (!parsedBio.success) {
      setError(parsedBio.error.errors[0]?.message ?? t.errorInvalidBio);
      return;
    }
    const nextAvatar = draftAvatarId ?? avatarId ?? AVATAR_IDS[0];
    if (!nextAvatar) {
      setError(t.errorChoosePhoto);
      return;
    }
    if (!isValidAvatarId(nextAvatar) && !isDisplayableCustomAvatarUrl(nextAvatar)) {
      setError(t.errorChoosePhoto);
      return;
    }

    startTransition(async () => {
      try {
        if (nextAvatar !== avatarAtEditOpen) {
          if (isValidAvatarId(nextAvatar)) {
            await postAvatar(nextAvatar);
            setAvatarId(nextAvatar);
          } else if (isDisplayableCustomAvatarUrl(nextAvatar)) {
            setAvatarId(nextAvatar);
          }
        }
        await patchQuick({ nickname: parsedName.data, bio: parsedBio.data ?? "" });
        setNickname(parsedName.data);
        setBio(parsedBio.data ?? "");
        setSheet(null);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : t.errorCouldNotSave);
      }
    });
  };

  const pickAvatar = (id: string) => {
    if (avatarReturnToEdit) {
      setDraftAvatarId(id);
      setSheet("edit");
      return;
    }

    startTransition(async () => {
      const res = await apiFetch("/api/profile/avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarId: id }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload.success) {
        setError(typeof payload.error === "string" ? payload.error : t.errorCouldNotUpdate);
        return;
      }
      setAvatarId(id);
      setSheet(null);
      router.refresh();
    });
  };

  const displayName = nickname.trim() || t.displayNamePlaceholder;
  const bioDisplay = bio.trim() ? bio.trim() : t.taglineEmpty;
  const schoolLine = schoolSummary ? buildSchoolSubtitle(schoolSummary, t.schoolLineSemester) : null;
  const isCropOpen = avatarCropFile !== null;

  const dismissOverlay = useCallback(() => {
    if (pending) return;
    if (isCropOpen) {
      setAvatarCropFile(null);
      return;
    }
    if (sheet === "edit" && sheetProfileInitialValues) {
      setSheet(null);
      return;
    }
    setSheet(avatarReturnToEdit ? "edit" : null);
  }, [pending, isCropOpen, sheet, sheetProfileInitialValues, avatarReturnToEdit]);

  return (
    <>
      {variant === "summary" ? (
        <button
          type="button"
          onClick={openEditProfile}
          aria-label={t.editProfileAria}
          className={cn(
            mePageCardClass,
            "relative w-full bg-gradient-to-b from-classmates-warm-alt/50 to-classmates-surface text-left transition-colors",
            "hover:from-classmates-warm-alt/70 hover:to-classmates-warm-alt/40 active:bg-muted/30",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            "dark:from-card dark:to-card dark:hover:from-muted/40 dark:hover:to-card dark:active:bg-muted/40",
          )}
        >
          <div className="flex gap-3.5 px-4 py-3.5">
            <figure className="m-0 shrink-0 self-start">
              <PresetAvatar
                id={avatarId}
                size={64}
                className="ring-2 ring-[#F3F4F6] shadow-[0_4px_12px_-4px_rgba(15,23,42,0.12)] dark:ring-border"
              />
              <figcaption className="sr-only">{t.profilePhotoCaption}</figcaption>
            </figure>
            <div className="min-w-0 flex-1 text-left">
              <div className="flex flex-wrap items-center gap-1.5">
                <p className="truncate text-[17px] font-semibold leading-tight text-classmates-ink dark:text-foreground">
                  {displayName}
                </p>
                {gender ? <UserGenderProfileMark gender={gender} iconClassName="h-3.5 w-3.5" /> : null}
              </div>
              {belowDisplayName ? (
                <div className="mt-1 w-full min-w-0 max-w-full">{belowDisplayName}</div>
              ) : null}
              {schoolLine ? (
                <p className="mt-0.5 text-[13px] font-medium leading-snug text-classmates-sub dark:text-muted-foreground">
                  {schoolLine}
                </p>
              ) : null}
              <p className="mt-1 line-clamp-4 text-pretty text-[13px] leading-snug text-classmates-sub dark:text-muted-foreground">
                {bioDisplay}
              </p>
            </div>
            <ChevronRight
              className="mt-1 h-5 w-5 shrink-0 self-start text-muted-foreground/45"
              strokeWidth={2}
              aria-hidden
            />
          </div>
        </button>
      ) : variant === "hero" ? (
        <div className={heroCardClass}>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={openEditProfile}
            aria-label={t.editProfileAria}
            className="absolute right-4 top-4 z-[1] rounded-full border-classmates-edge bg-classmates-surface/95 px-3.5 text-[13px] font-semibold text-classmates-blue shadow-sm backdrop-blur-sm dark:border-border dark:bg-card/95"
          >
            {t.editProfile}
          </Button>

          <div className="flex flex-col items-center px-4 pb-6 pt-10 text-center sm:px-6 sm:pb-8 sm:pt-12">
            <figure className="m-0">
              <PresetAvatar
                id={avatarId}
                size={116}
                className="ring-[6px] ring-classmates-warm-alt shadow-[0_12px_32px_-8px_rgba(15,23,42,0.18)] dark:ring-background"
              />
              <figcaption className="sr-only">{t.profilePhotoCaption}</figcaption>
            </figure>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
              <p className="page-screen-title-ink max-w-[18rem] truncate sm:max-w-md">{displayName}</p>
              {gender ? <UserGenderProfileMark gender={gender} iconClassName="h-5 w-5" /> : null}
            </div>
            {schoolLine ? (
              <p className="mt-2 max-w-md px-1 text-[14px] font-medium leading-snug text-classmates-sub dark:text-zinc-400">
                {schoolLine}
              </p>
            ) : null}
            <p className="mt-4 max-w-md text-pretty text-[15px] leading-relaxed text-classmates-sub dark:text-zinc-400 line-clamp-2">
              {bioDisplay}
            </p>
          </div>
        </div>
      ) : (
        <nav className="divide-y divide-border" aria-label={t.profileRowsNavAria}>
          <button
            type="button"
            className={ROW}
            onClick={() => {
              setAvatarReturnToEdit(false);
              setSheet("avatar");
            }}
          >
            <span className="shrink-0 text-[15px] font-medium text-foreground">{t.rowPhoto}</span>
            <span className="flex min-w-0 items-center gap-2">
              <PresetAvatar className="h-11 w-11" id={avatarId} />
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" aria-hidden />
            </span>
          </button>
          <button type="button" className={ROW} onClick={openName}>
            <span className="shrink-0 text-[15px] font-medium text-foreground">{t.rowName}</span>
            <span className="flex min-w-0 max-w-[62%] items-center gap-1">
              <span className="truncate text-right text-[14px] text-muted-foreground">
                {nickname.trim() || "—"}
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" aria-hidden />
            </span>
          </button>
          <button type="button" className={ROW} onClick={openBio}>
            <span className="shrink-0 text-[15px] font-medium text-foreground">{t.rowBio}</span>
            <span className="flex min-w-0 max-w-[62%] items-center gap-1">
              <span className="truncate text-right text-[14px] text-muted-foreground">
                {bio.trim() ? bio.trim() : "—"}
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" aria-hidden />
            </span>
          </button>
        </nav>
      )}

      <AppPushLayer
        open={Boolean(sheet || isCropOpen)}
        onClose={dismissOverlay}
        zClassName="z-[50]"
        panelClassName="w-[min(100vw,28rem)] border-0"
      >
        <div className="flex h-full min-h-0 flex-col bg-background pt-[env(safe-area-inset-top)]">
          <input
            ref={avatarUploadInputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file || pending) return;
              if (!file.type.startsWith("image/")) {
                setError(t.chooseImageFile);
                return;
              }
              setAvatarCropFile(file);
            }}
          />
          <div
            className="flex min-h-0 flex-1 flex-col overflow-hidden"
            style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
          >
            {isCropOpen && avatarCropFile ? (
              <>
                <SheetScreenHeader
                  title={crop.adjustTitle}
                  backAriaLabel={t.backAria}
                  disabled={pending}
                  onBack={() => {
                    if (!pending) setAvatarCropFile(null);
                  }}
                />
                <p className="px-4 pt-3 text-center text-[12px] text-muted-foreground">{crop.adjustHint}</p>
                <div className="max-h-[min(82dvh,720px)] overflow-y-auto px-4 pb-4 pt-2">
                  <AvatarCropEditor
                    file={avatarCropFile}
                    pending={pending}
                    showIntroText={false}
                    onCancel={() => setAvatarCropFile(null)}
                    onConfirm={async (nextFile) => {
                      const mode = avatarUploadTargetRef.current;
                      setAvatarCropFile(null);
                      runAvatarUpload(nextFile, mode);
                    }}
                  />
                  {error ? <p className="mt-3 text-center text-[12px] text-destructive">{error}</p> : null}
                </div>
              </>
            ) : null}

            {sheet === "edit" && !isCropOpen ? (
              <>
                <SheetScreenHeader
                  title={t.editProfileSheetTitle}
                  backAriaLabel={t.backAria}
                  disabled={pending}
                  onBack={() => setSheet(null)}
                />
                {sheetProfileInitialValues && sheetProfileFormKey ? (
                  <div className="max-h-[min(85dvh,720px)] overflow-y-auto px-3 py-3">
                    <ProfileForm
                      key={sheetProfileFormKey}
                      variant="sheet"
                      initialValues={sheetProfileInitialValues}
                      avatarId={avatarId}
                      discoverCity={discoverCity}
                      submitLabel={pf.saveChanges}
                      onSaved={() => setSheet(null)}
                      requireDirtyToSubmit
                      mePageStructure={false}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      className="mt-2 h-9 w-full text-[13px] text-muted-foreground"
                      onClick={() => setSheet(null)}
                    >
                      {common.cancel}
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="max-h-[min(70dvh,520px)] overflow-y-auto px-4 py-4">
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {t.photoSectionLabel}
                      </p>
                      <div className="mb-3 flex flex-col items-center gap-2">
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => {
                            setAvatarReturnToEdit(true);
                            setSheet("avatar");
                          }}
                          className="group relative rounded-full transition active:scale-[0.98] disabled:opacity-60"
                          aria-label={t.uploadPhoto}
                        >
                          <PresetAvatar
                            id={draftAvatarId}
                            size={72}
                            className="ring-[3px] ring-classmates-edge ring-offset-2 ring-offset-background dark:ring-border"
                          />
                          <span className="absolute inset-0 rounded-full bg-black/0 transition group-hover:bg-black/10" aria-hidden />
                        </button>
                        {isDisplayableCustomAvatarUrl(draftAvatarId) ? (
                          <p className="text-center text-[11px] text-muted-foreground">{t.usingUploadedPhoto}</p>
                        ) : null}
                        <p className="text-center text-[11px] text-muted-foreground">{t.tapAvatarHint}</p>
                      </div>
                      <p className="mb-1 mt-5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {t.displayNameLabel}
                      </p>
                      <Input
                        value={draftName}
                        onChange={(e) => setDraftName(e.target.value)}
                        maxLength={32}
                        placeholder={t.nameFieldPlaceholder}
                        className="h-11 rounded-[20px] border-classmates-edge bg-muted/40 text-[15px] outline-none transition focus-visible:border-classmates-azure focus-visible:ring-2 focus-visible:ring-classmates-azure/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:border-border"
                      />
                      <p className="mt-1 text-right text-[11px] text-muted-foreground tabular-nums">{draftName.length}/32</p>
                      <p className="mb-1 mt-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {t.bioSectionLabel}
                      </p>
                      <Textarea
                        value={draftBio}
                        onChange={(e) => setDraftBio(e.target.value)}
                        maxLength={120}
                        rows={4}
                        placeholder={t.bioFieldPlaceholder}
                        className="resize-none rounded-[20px] border-classmates-edge bg-muted/40 text-[15px] leading-relaxed outline-none transition focus-visible:border-classmates-azure focus-visible:ring-2 focus-visible:ring-classmates-azure/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:border-border"
                      />
                      <p className="mt-1 text-right text-[11px] text-muted-foreground tabular-nums">{draftBio.length}/120</p>
                      {error ? <p className="mt-3 text-[12px] text-destructive">{error}</p> : null}
                    </div>
                    <div className="border-t border-border px-3 pt-2">
                      <Button
                        type="button"
                        className={cn("h-11 w-full rounded-full text-[16px] font-medium", SAVE_RED)}
                        disabled={pending}
                        onClick={saveEditProfile}
                      >
                        {pending ? t.saving : t.save}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        className="mt-1 h-10 w-full text-[14px] text-muted-foreground"
                        disabled={pending}
                        onClick={() => setSheet(null)}
                      >
                        {common.cancel}
                      </Button>
                    </div>
                  </>
                )}
              </>
            ) : null}

            {sheet === "avatar" && !isCropOpen ? (
              <>
                <SheetScreenHeader
                  title={t.photoSheetTitle}
                  backAriaLabel={t.backAria}
                  disabled={pending}
                  onBack={() => setSheet(avatarReturnToEdit ? "edit" : null)}
                />
                <div className="max-h-[52dvh] overflow-y-auto px-3 pb-2 pt-3">
                  <div className="mb-4 flex flex-col items-center gap-2">
                    <PresetAvatar
                      id={avatarId}
                      size={72}
                      className="ring-[3px] ring-classmates-edge ring-offset-2 ring-offset-background dark:ring-border"
                    />
                    {isDisplayableCustomAvatarUrl(avatarId) ? (
                      <p className="text-center text-[11px] text-muted-foreground">{t.yourUploadedPhoto}</p>
                    ) : null}
                    <Button
                      type="button"
                      variant="outline"
                      disabled={pending}
                      className="h-10 rounded-full border-classmates-edge px-5 text-[14px] font-medium dark:border-border"
                      onClick={() => {
                        avatarUploadTargetRef.current = avatarReturnToEdit ? "edit" : "sheet";
                        avatarUploadInputRef.current?.click();
                      }}
                    >
                      {t.uploadPhoto}
                    </Button>
                    <p className="text-center text-[10px] text-muted-foreground">{t.avatarFormatsHint}</p>
                  </div>
                  <div className="grid grid-cols-5 gap-3">
                    {AVATAR_IDS.map((id) => (
                      <button
                        key={id}
                        type="button"
                        disabled={pending}
                        onClick={() => pickAvatar(id)}
                        className={cn(
                          "flex justify-center rounded-full p-0.5 transition-transform active:scale-95",
                          isValidAvatarId(avatarId) &&
                            id === avatarId &&
                            "ring-2 ring-[#ff2442] ring-offset-2 ring-offset-background",
                        )}
                        aria-label={formatMessage(t.avatarPresetAria, { id })}
                        aria-pressed={isValidAvatarId(avatarId) && id === avatarId}
                      >
                        <PresetAvatar className="h-12 w-12" id={id} />
                      </button>
                    ))}
                  </div>
                </div>
                <div className="border-t border-border px-3 pt-2">
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-11 w-full text-[15px] text-muted-foreground"
                    disabled={pending}
                    onClick={() => setSheet(avatarReturnToEdit ? "edit" : null)}
                  >
                    {common.cancel}
                  </Button>
                </div>
              </>
            ) : null}

            {sheet === "name" && !isCropOpen ? (
              <>
                <SheetScreenHeader
                  title={t.rowName}
                  backAriaLabel={t.backAria}
                  disabled={pending}
                  onBack={() => setSheet(null)}
                />
                <div className="px-4 py-4">
                  <Input
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    maxLength={32}
                    placeholder={t.nameFieldPlaceholder}
                    className="h-12 rounded-[20px] border-border bg-muted/40 text-[15px] focus-visible:border-[#ff2442] focus-visible:ring-[#ff2442]/25"
                  />
                  <p className="mt-2 text-right text-[11px] text-muted-foreground tabular-nums">{draftName.length}/32</p>
                  {error ? <p className="mt-2 text-[12px] text-destructive">{error}</p> : null}
                </div>
                <div className="border-t border-border px-3 pt-2">
                  <Button
                    type="button"
                    className={cn("h-11 w-full rounded-full text-[16px] font-medium", SAVE_RED)}
                    disabled={pending}
                    onClick={saveName}
                  >
                    {pending ? t.saving : t.save}
                  </Button>
                </div>
              </>
            ) : null}

            {sheet === "bio" && !isCropOpen ? (
              <>
                <SheetScreenHeader
                  title={t.rowBio}
                  backAriaLabel={t.backAria}
                  disabled={pending}
                  onBack={() => setSheet(null)}
                />
                <div className="px-4 py-4">
                  <Textarea
                    value={draftBio}
                    onChange={(e) => setDraftBio(e.target.value)}
                    maxLength={120}
                    rows={5}
                    placeholder={t.bioFieldPlaceholder}
                    className="min-h-[8rem] resize-none rounded-[20px] border-border bg-muted/40 text-[15px] leading-relaxed focus-visible:border-[#ff2442] focus-visible:ring-[#ff2442]/25"
                  />
                  <p className="mt-2 text-right text-[11px] text-muted-foreground tabular-nums">{draftBio.length}/120</p>
                  {error ? <p className="mt-2 text-[12px] text-destructive">{error}</p> : null}
                </div>
                <div className="border-t border-border px-3 pt-2">
                  <Button
                    type="button"
                    className={cn("h-11 w-full rounded-full text-[16px] font-medium", SAVE_RED)}
                    disabled={pending}
                    onClick={saveBio}
                  >
                    {pending ? t.saving : t.save}
                  </Button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </AppPushLayer>
    </>
  );
}
