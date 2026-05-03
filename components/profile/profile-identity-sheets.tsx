"use client";

/** List rows + bottom sheets for photo, display name, and bio (Me tab). */

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";

import { PresetAvatar } from "@/components/ui/preset-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AVATAR_IDS } from "@/lib/constants/avatars";
import { cn } from "@/lib/utils";
import { homeProfileQuickSchema } from "@/lib/validators/profile";

type Sheet = null | "avatar" | "name" | "bio";

const ROW =
  "flex min-h-[3.25rem] w-full items-center justify-between gap-3 px-4 py-3 text-left active:bg-muted/70";

const SAVE_RED = "bg-[#ff2442] text-white hover:bg-[#e61e3a]";

export function ProfileIdentitySheets({
  initialNickname,
  initialBio,
  initialAvatarUrl,
}: {
  initialNickname: string | null;
  initialBio: string | null;
  initialAvatarUrl: string | null;
}) {
  const router = useRouter();
  const [sheet, setSheet] = useState<Sheet>(null);
  const [nickname, setNickname] = useState(initialNickname?.trim() ?? "");
  const [bio, setBio] = useState(initialBio ?? "");
  const [avatarId, setAvatarId] = useState<string | null>(initialAvatarUrl);
  const [draftName, setDraftName] = useState("");
  const [draftBio, setDraftBio] = useState("");
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

  const patchQuick = useCallback(async (body: { nickname?: string; bio?: string }) => {
    const res = await fetch("/api/profile/quick", {
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

  const pickAvatar = (id: string) => {
    startTransition(async () => {
      const res = await fetch("/api/profile/avatar", {
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

  const displayName = nickname.trim() || "—";
  const bioPreview = bio.trim() ? bio.trim() : "—";

  return (
    <>
      <nav className="divide-y divide-border" aria-label="Profile">
        <button type="button" className={ROW} onClick={() => setSheet("avatar")}>
          <span className="shrink-0 text-[15px] font-medium text-foreground">Photo</span>
          <span className="flex min-w-0 items-center gap-2">
            <PresetAvatar className="h-11 w-11" id={avatarId} />
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" aria-hidden />
          </span>
        </button>
        <button type="button" className={ROW} onClick={openName}>
          <span className="shrink-0 text-[15px] font-medium text-foreground">Name</span>
          <span className="flex min-w-0 max-w-[62%] items-center gap-1">
            <span className="truncate text-right text-[14px] text-muted-foreground">{displayName}</span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" aria-hidden />
          </span>
        </button>
        <button type="button" className={ROW} onClick={openBio}>
          <span className="shrink-0 text-[15px] font-medium text-foreground">Bio</span>
          <span className="flex min-w-0 max-w-[62%] items-center gap-1">
            <span className="truncate text-right text-[14px] text-muted-foreground">{bioPreview}</span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" aria-hidden />
          </span>
        </button>
      </nav>

      {sheet ? (
        <div className="fixed inset-0 z-[50] flex flex-col justify-end" role="dialog" aria-modal="true">
          <button
            type="button"
            className="absolute inset-0 bg-black/45"
            aria-label="Close"
            onClick={() => !pending && setSheet(null)}
          />
          <div
            className="relative max-h-[88dvh] w-full overflow-hidden rounded-t-[14px] bg-background shadow-[0_-8px_32px_rgba(0,0,0,0.12)]"
            style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
          >
            <div className="mx-auto mt-2 h-1 w-9 rounded-full bg-muted" aria-hidden />

            {sheet === "avatar" ? (
              <>
                <div className="border-b border-border px-4 py-3 text-center text-[16px] font-semibold text-foreground">
                  Photo
                </div>
                <div className="max-h-[52dvh] overflow-y-auto px-3 pb-2 pt-3">
                  <div className="grid grid-cols-5 gap-3">
                    {AVATAR_IDS.map((id) => (
                      <button
                        key={id}
                        type="button"
                        disabled={pending}
                        onClick={() => pickAvatar(id)}
                        className={cn(
                          "flex justify-center rounded-full p-0.5 transition-transform active:scale-95",
                          id === avatarId && "ring-2 ring-[#ff2442] ring-offset-2 ring-offset-background",
                        )}
                        aria-label={`Avatar ${id}`}
                        aria-pressed={id === avatarId}
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
                    onClick={() => setSheet(null)}
                  >
                    Cancel
                  </Button>
                </div>
              </>
            ) : null}

            {sheet === "name" ? (
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
                    className="h-12 rounded-lg border-border bg-muted/40 text-[15px] focus-visible:border-[#ff2442] focus-visible:ring-[#ff2442]/25"
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

            {sheet === "bio" ? (
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
                    className="min-h-[8rem] resize-none rounded-lg border-border bg-muted/40 text-[15px] leading-relaxed focus-visible:border-[#ff2442] focus-visible:ring-[#ff2442]/25"
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
