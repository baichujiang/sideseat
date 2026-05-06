"use client";

import { apiFetch } from "@/lib/auth/api-fetch";

/** Compact rows (onboarding), centered hero, or summary strip + sheets (Me /profile). */

import type { UserGender } from "@prisma/client";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import type { z } from "zod";

import { AvatarCropEditor } from "@/components/profile/avatar-crop-editor";
import { ProfileForm } from "@/components/forms/profile-form";
import { PresetAvatar } from "@/components/ui/preset-avatar";
import { UserGenderProfileMark } from "@/components/ui/user-gender-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AVATAR_IDS, isDisplayableCustomAvatarUrl, isValidAvatarId } from "@/lib/constants/avatars";
import { uploadProfileAvatarPhoto } from "@/lib/profile/upload-avatar";
import { cn } from "@/lib/utils";
import { homeProfileQuickSchema, profileSchema } from "@/lib/validators/profile";

type Sheet = null | "edit" | "avatar" | "name" | "bio";
type SheetProfileValues = z.infer<typeof profileSchema>;

const ROW =
  "flex min-h-[3.25rem] w-full items-center justify-between gap-3 px-4 py-3 text-left active:bg-muted/70";

const SAVE_RED = "bg-[#ff2442] text-white hover:bg-[#e61e3a]";

const heroCardClass =
  "relative overflow-hidden rounded-2xl border border-classmates-edge bg-classmates-surface shadow-[0_4px_16px_rgba(15,23,42,0.05)] dark:border-border dark:bg-card";

export type ProfileSchoolSummary = {
  schoolShort: string;
  degreeLabel: string;
  major: string;
  semester: number;
};

function buildSchoolSubtitle(summary: ProfileSchoolSummary): string {
  const majorOrDegree = summary.major.trim() || summary.degreeLabel;
  return [summary.schoolShort, majorOrDegree, `Sem ${summary.semester}`].join(" · ");
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
}) {
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

  useEffect(() => {
    if (sheet) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
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
      throw new Error(typeof payload.error === "string" ? payload.error : "Could not save.");
    }
    router.refresh();
  }, [router]);

  const postAvatar = useCallback(async (id: string) => {
    const res = await apiFetch("/api/profile/avatar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ avatarId: id }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok || !payload.success) {
      throw new Error(typeof payload.error === "string" ? payload.error : "Could not update photo.");
    }
  }, []);

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
          setError(e instanceof Error ? e.message : "Could not upload photo.");
        }
      });
    },
    [router],
  );

  const saveName = () => {
    setError("");
    const parsed = homeProfileQuickSchema.shape.nickname.safeParse(draftName.trim());
    if (!parsed.success) {
      setError(parsed.error.errors[0]?.message ?? "Invalid name.");
      return;
    }
    startTransition(async () => {
      try {
        await patchQuick({ nickname: parsed.data });
        setNickname(parsed.data);
        setSheet(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save.");
      }
    });
  };

  const saveBio = () => {
    setError("");
    const parsed = homeProfileQuickSchema.shape.bio.safeParse(draftBio.trim() === "" ? "" : draftBio.trim());
    if (!parsed.success) {
      setError(parsed.error.errors[0]?.message ?? "Invalid bio.");
      return;
    }
    startTransition(async () => {
      try {
        await patchQuick({ bio: parsed.data });
        const nextBio = parsed.data ?? "";
        setBio(nextBio);
        setSheet(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save.");
      }
    });
  };

  const saveEditProfile = () => {
    setError("");
    const parsedName = homeProfileQuickSchema.shape.nickname.safeParse(draftName.trim());
    if (!parsedName.success) {
      setError(parsedName.error.errors[0]?.message ?? "Invalid name.");
      return;
    }
    const parsedBio = homeProfileQuickSchema.shape.bio.safeParse(draftBio.trim() === "" ? "" : draftBio.trim());
    if (!parsedBio.success) {
      setError(parsedBio.error.errors[0]?.message ?? "Invalid bio.");
      return;
    }
    const nextAvatar = draftAvatarId ?? avatarId ?? AVATAR_IDS[0];
    if (!nextAvatar) {
      setError("Choose a profile photo.");
      return;
    }
    if (!isValidAvatarId(nextAvatar) && !isDisplayableCustomAvatarUrl(nextAvatar)) {
      setError("Choose a profile photo.");
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
        setError(e instanceof Error ? e.message : "Could not save.");
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
        setError(typeof payload.error === "string" ? payload.error : "Could not update.");
        return;
      }
      setAvatarId(id);
      setSheet(null);
      router.refresh();
    });
  };

  const displayName = nickname.trim() || "Your name";
  const bioDisplay = bio.trim() ? bio.trim() : "No tagline yet";
  const schoolLine = schoolSummary ? buildSchoolSubtitle(schoolSummary) : null;
  const isCropOpen = avatarCropFile !== null;

  return (
    <>
      {variant === "summary" ? (
        <div className={cn(heroCardClass, "bg-gradient-to-b from-classmates-warm-alt/35 to-classmates-surface dark:from-card dark:to-card")}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={openEditProfile}
            aria-label="Edit profile"
            className="absolute right-2 top-2 z-[1] rounded-full border border-classmates-edge/70 bg-classmates-surface/90 px-3 py-1.5 text-[12px] font-semibold text-classmates-sub shadow-none backdrop-blur-sm hover:border-classmates-edge hover:bg-classmates-blue-soft/60 hover:text-classmates-blue sm:right-3 sm:top-3 sm:px-3.5 dark:border-border dark:bg-card/90 dark:text-zinc-300 dark:hover:text-classmates-blue"
          >
            Edit profile
          </Button>

          <div className="flex gap-3 px-3 pb-4 pt-4 pr-[5.25rem] sm:gap-4 sm:px-4 sm:pb-5 sm:pt-5 sm:pr-24">
            <figure className="m-0 shrink-0 self-start">
              <PresetAvatar
                id={avatarId}
                size={84}
                className="ring-[4px] ring-classmates-warm-alt shadow-[0_8px_24px_-6px_rgba(15,23,42,0.15)] dark:ring-background"
              />
              <figcaption className="sr-only">Your profile photo</figcaption>
            </figure>
            <div className="min-w-0 flex-1 text-left">
              <div className="flex flex-wrap items-center gap-2">
                <p className="page-screen-title-ink truncate">{displayName}</p>
                {gender ? <UserGenderProfileMark gender={gender} iconClassName="h-4 w-4" /> : null}
              </div>
              {schoolLine ? (
                <p className="mt-1.5 text-[14px] font-medium leading-snug text-classmates-sub dark:text-zinc-400">
                  {schoolLine}
                </p>
              ) : null}
              <p className="mt-2.5 text-pretty text-[14px] leading-relaxed text-classmates-sub dark:text-zinc-400 sm:text-[15px] line-clamp-4">
                {bioDisplay}
              </p>
            </div>
          </div>
        </div>
      ) : variant === "hero" ? (
        <div className={heroCardClass}>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={openEditProfile}
            className="absolute right-4 top-4 z-[1] rounded-full border-classmates-edge bg-classmates-surface/95 px-3.5 text-[13px] font-semibold text-classmates-blue shadow-sm backdrop-blur-sm dark:border-border dark:bg-card/95"
          >
            Edit profile
          </Button>

          <div className="flex flex-col items-center px-4 pb-6 pt-10 text-center sm:px-6 sm:pb-8 sm:pt-12">
            <figure className="m-0">
              <PresetAvatar
                id={avatarId}
                size={116}
                className="ring-[6px] ring-classmates-warm-alt shadow-[0_12px_32px_-8px_rgba(15,23,42,0.18)] dark:ring-background"
              />
              <figcaption className="sr-only">Your profile photo</figcaption>
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
        <nav className="divide-y divide-border" aria-label="Profile">
          <button
            type="button"
            className={ROW}
            onClick={() => {
              setAvatarReturnToEdit(false);
              setSheet("avatar");
            }}
          >
            <span className="shrink-0 text-[15px] font-medium text-foreground">Photo</span>
            <span className="flex min-w-0 items-center gap-2">
              <PresetAvatar className="h-11 w-11" id={avatarId} />
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" aria-hidden />
            </span>
          </button>
          <button type="button" className={ROW} onClick={openName}>
            <span className="shrink-0 text-[15px] font-medium text-foreground">Name</span>
            <span className="flex min-w-0 max-w-[62%] items-center gap-1">
              <span className="truncate text-right text-[14px] text-muted-foreground">
                {nickname.trim() || "—"}
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" aria-hidden />
            </span>
          </button>
          <button type="button" className={ROW} onClick={openBio}>
            <span className="shrink-0 text-[15px] font-medium text-foreground">Bio</span>
            <span className="flex min-w-0 max-w-[62%] items-center gap-1">
              <span className="truncate text-right text-[14px] text-muted-foreground">
                {bio.trim() ? bio.trim() : "—"}
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" aria-hidden />
            </span>
          </button>
        </nav>
      )}

      {sheet || isCropOpen ? (
        <div className="fixed inset-0 z-[50] flex flex-col justify-end" role="dialog" aria-modal="true">
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
                setError("Choose an image file.");
                return;
              }
              setAvatarCropFile(file);
            }}
          />
          <button
            type="button"
            className="absolute inset-0 bg-black/45"
            aria-label="Close"
            onClick={() => {
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
            }}
          />
          <div
            className="relative max-h-[88dvh] w-full overflow-hidden rounded-t-[28px] bg-background shadow-[0_-8px_32px_rgba(0,0,0,0.12)]"
            style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
          >
            <div className="mx-auto mt-2 h-1 w-9 rounded-full bg-muted" aria-hidden />

            {isCropOpen ? (
              <div className="max-h-[min(82dvh,720px)] overflow-y-auto px-4 py-4">
                <AvatarCropEditor
                  file={avatarCropFile}
                  pending={pending}
                  onCancel={() => setAvatarCropFile(null)}
                  onConfirm={async (nextFile) => {
                    const mode = avatarUploadTargetRef.current;
                    setAvatarCropFile(null);
                    runAvatarUpload(nextFile, mode);
                  }}
                />
                {error ? <p className="mt-3 text-center text-[12px] text-destructive">{error}</p> : null}
              </div>
            ) : null}

            {sheet === "edit" && !isCropOpen ? (
              <>
                <div className="border-b border-border px-4 py-3 text-center text-[16px] font-semibold text-foreground">
                  Edit profile
                </div>
                {sheetProfileInitialValues && sheetProfileFormKey ? (
                  <div className="max-h-[min(85dvh,720px)] overflow-y-auto px-4 py-4">
                    <ProfileForm
                      key={sheetProfileFormKey}
                      variant="sheet"
                      initialValues={sheetProfileInitialValues}
                      avatarId={avatarId}
                      submitLabel="Save changes"
                      onSaved={() => setSheet(null)}
                      requireDirtyToSubmit
                      mePageStructure={false}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      className="mt-3 h-10 w-full text-[14px] text-muted-foreground"
                      onClick={() => setSheet(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="max-h-[min(70dvh,520px)] overflow-y-auto px-4 py-4">
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Photo
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
                          aria-label="Choose profile photo"
                        >
                          <PresetAvatar
                            id={draftAvatarId}
                            size={72}
                            className="ring-[3px] ring-classmates-edge ring-offset-2 ring-offset-background dark:ring-border"
                          />
                          <span className="absolute inset-0 rounded-full bg-black/0 transition group-hover:bg-black/10" aria-hidden />
                        </button>
                        {isDisplayableCustomAvatarUrl(draftAvatarId) ? (
                          <p className="text-center text-[11px] text-muted-foreground">Using your uploaded photo</p>
                        ) : null}
                        <p className="text-center text-[11px] text-muted-foreground">
                          Tap avatar to upload or choose a default.
                        </p>
                      </div>
                      <p className="mb-1 mt-5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Display name
                      </p>
                      <Input
                        value={draftName}
                        onChange={(e) => setDraftName(e.target.value)}
                        maxLength={32}
                        placeholder="2–32 characters"
                        className="h-11 rounded-[20px] border-classmates-edge bg-muted/40 text-[15px] outline-none transition focus-visible:border-classmates-azure focus-visible:ring-2 focus-visible:ring-classmates-azure/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:border-border"
                      />
                      <p className="mt-1 text-right text-[11px] text-muted-foreground tabular-nums">{draftName.length}/32</p>
                      <p className="mb-1 mt-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Bio
                      </p>
                      <Textarea
                        value={draftBio}
                        onChange={(e) => setDraftBio(e.target.value)}
                        maxLength={120}
                        rows={4}
                        placeholder="Short line about you"
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
                        {pending ? "Saving…" : "Save"}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        className="mt-1 h-10 w-full text-[14px] text-muted-foreground"
                        disabled={pending}
                        onClick={() => setSheet(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </>
                )}
              </>
            ) : null}

            {sheet === "avatar" && !isCropOpen ? (
              <>
                <div className="border-b border-border px-4 py-3 text-center text-[16px] font-semibold text-foreground">
                  Photo
                </div>
                <div className="max-h-[52dvh] overflow-y-auto px-3 pb-2 pt-3">
                  <div className="mb-4 flex flex-col items-center gap-2">
                    <PresetAvatar
                      id={avatarId}
                      size={72}
                      className="ring-[3px] ring-classmates-edge ring-offset-2 ring-offset-background dark:ring-border"
                    />
                    {isDisplayableCustomAvatarUrl(avatarId) ? (
                      <p className="text-center text-[11px] text-muted-foreground">Your uploaded photo</p>
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
                      Upload photo
                    </Button>
                    <p className="text-center text-[10px] text-muted-foreground">Any image format · saved as a square avatar</p>
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
                        aria-label={`Avatar ${id}`}
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
                    Cancel
                  </Button>
                </div>
              </>
            ) : null}

            {sheet === "name" && !isCropOpen ? (
              <>
                <div className="border-b border-border px-4 py-3 text-center text-[16px] font-semibold text-foreground">
                  Name
                </div>
                <div className="px-4 py-4">
                  <Input
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    maxLength={32}
                    placeholder="2–32 characters"
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
                    {pending ? "Saving…" : "Save"}
                  </Button>
                </div>
              </>
            ) : null}

            {sheet === "bio" && !isCropOpen ? (
              <>
                <div className="border-b border-border px-4 py-3 text-center text-[16px] font-semibold text-foreground">
                  Bio
                </div>
                <div className="px-4 py-4">
                  <Textarea
                    value={draftBio}
                    onChange={(e) => setDraftBio(e.target.value)}
                    maxLength={120}
                    rows={5}
                    placeholder="Short line about you"
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
                    {pending ? "Saving…" : "Save"}
                  </Button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
