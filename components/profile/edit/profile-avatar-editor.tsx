"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { AvatarCropEditor } from "@/components/profile/avatar-crop-editor";
import { PresetAvatar } from "@/components/ui/preset-avatar";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/auth/api-fetch";
import { AVATAR_IDS, isDisplayableCustomAvatarUrl, isValidAvatarId } from "@/lib/constants/avatars";
import { uploadProfileAvatarPhoto } from "@/lib/profile/upload-avatar";
import { useAppMessages } from "@/hooks/use-app-locale";
import { formatMessage } from "@/lib/i18n/messages";
import { cn } from "@/lib/utils";

export function ProfileAvatarEditor({ initialAvatarUrl }: { initialAvatarUrl: string | null }) {
  const t = useAppMessages().meIdentity;
  const crop = useAppMessages().meAvatarCrop;
  const router = useRouter();
  const uploadRef = useRef<HTMLInputElement>(null);
  const [avatarId, setAvatarId] = useState<string | null>(initialAvatarUrl);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const runUpload = useCallback(
    (file: File) => {
      setError("");
      startTransition(async () => {
        try {
          const url = await uploadProfileAvatarPhoto(file);
          setAvatarId(url);
          router.refresh();
        } catch (e) {
          setError(e instanceof Error ? e.message : t.errorCouldNotUpload);
        }
      });
    },
    [router, t.errorCouldNotUpload],
  );

  const pickPreset = (id: string) => {
    setError("");
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
      router.push("/profile/info");
      router.refresh();
    });
  };

  if (cropFile) {
    return (
      <div className="space-y-3">
        <p className="text-center text-[12px] text-muted-foreground">{crop.adjustHint}</p>
        <AvatarCropEditor
          file={cropFile}
          pending={pending}
          showIntroText={false}
          onCancel={() => setCropFile(null)}
          onConfirm={async (nextFile) => {
            setCropFile(null);
            runUpload(nextFile);
          }}
        />
        {error ? <p className="text-center text-[12px] text-destructive">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <input
        ref={uploadRef}
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
          setCropFile(file);
        }}
      />
      <div className="flex flex-col items-center gap-2">
        <PresetAvatar
          id={avatarId}
          size={88}
          className="ring-[3px] ring-classmates-edge ring-offset-2 ring-offset-background dark:ring-border"
        />
        {isDisplayableCustomAvatarUrl(avatarId) ? (
          <p className="text-center text-[11px] text-muted-foreground">{t.yourUploadedPhoto}</p>
        ) : null}
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          className="h-10 rounded-full px-5 text-[14px] font-medium"
          onClick={() => uploadRef.current?.click()}
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
            onClick={() => pickPreset(id)}
            className={cn(
              "flex justify-center rounded-full p-0.5 transition-transform active:scale-95",
              isValidAvatarId(avatarId) && id === avatarId && "ring-2 ring-[#ff2442] ring-offset-2",
            )}
            aria-label={formatMessage(t.avatarPresetAria, { id })}
            aria-pressed={isValidAvatarId(avatarId) && id === avatarId}
          >
            <PresetAvatar className="h-12 w-12" id={id} />
          </button>
        ))}
      </div>
      {error ? <p className="text-center text-[12px] text-destructive">{error}</p> : null}
    </div>
  );
}
