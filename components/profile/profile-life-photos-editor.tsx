"use client";

import { useCallback, useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";

import { apiFetch } from "@/lib/auth/api-fetch";
import { USER_LIFE_PHOTO_MAX } from "@/lib/constants/user-life-photo-media";
import { useAppMessages } from "@/hooks/use-app-locale";
import { formatMessage } from "@/lib/i18n/messages";
import { uploadProfileLifePhoto } from "@/lib/profile/upload-life-photo";
import { cn } from "@/lib/utils";

export type LifePhotoRow = {
  id: string;
  url: string;
  sortOrder: number;
};

export function ProfileLifePhotosEditor({
  initialPhotos,
  readOnly = false,
  layout = "page",
}: {
  initialPhotos: LifePhotoRow[];
  readOnly?: boolean;
  /** `me` — compact spacing on Me page top block. */
  layout?: "page" | "me";
}) {
  const m = useAppMessages();
  const lp = m.profileLifePhotos;
  const [photos, setPhotos] = useState(initialPhotos);
  const [uploading, setUploading] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const canAdd = !readOnly && photos.length < USER_LIFE_PHOTO_MAX && !uploading;

  const onPickFile = useCallback(
    async (file: File | undefined) => {
      if (!file || readOnly || uploading) return;
      setError(null);
      setUploading(true);
      try {
        const { id, url } = await uploadProfileLifePhoto(file);
        setPhotos((prev) => {
          const next = [...prev, { id, url, sortOrder: prev.length }];
          return next.sort((a, b) => a.sortOrder - b.sortOrder);
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : lp.errorUpload);
      } finally {
        setUploading(false);
        if (inputRef.current) inputRef.current.value = "";
      }
    },
    [readOnly, uploading, lp.errorUpload],
  );

  async function removePhoto(photoId: string) {
    if (readOnly || removingId) return;
    setError(null);
    setRemovingId(photoId);
    try {
      const res = await apiFetch(`/api/profile/life-photos/${encodeURIComponent(photoId)}`, {
        method: "DELETE",
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload?.success) {
        throw new Error(typeof payload.error === "string" ? payload.error : lp.errorRemove);
      }
      setPhotos((prev) => prev.filter((p) => p.id !== photoId));
    } catch (err) {
      setError(err instanceof Error ? err.message : lp.errorRemove);
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className={cn(layout === "me" ? "space-y-1.5" : "space-y-3")}>
      {!readOnly && layout !== "me" ? (
        <p className="text-[12px] leading-snug text-muted-foreground">
          {formatMessage(lp.hint, { max: USER_LIFE_PHOTO_MAX })}
        </p>
      ) : null}

      <div className={cn("grid grid-cols-3", layout === "me" ? "gap-1.5" : "gap-2")}>
        {photos.map((photo) => (
          <div
            key={photo.id}
            className="relative aspect-square overflow-hidden rounded-xl border border-border/70 bg-muted/30"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- user-uploaded blob/data URL */}
            <img src={photo.url} alt="" className="h-full w-full object-cover" />
            {!readOnly ? (
              <button
                type="button"
                onClick={() => void removePhoto(photo.id)}
                disabled={removingId === photo.id}
                className={cn(
                  "absolute right-1 top-1 inline-flex h-7 w-7 items-center justify-center rounded-full",
                  "bg-background/90 text-destructive shadow-sm backdrop-blur-sm",
                  "hover:bg-background disabled:opacity-60",
                )}
                aria-label={lp.removePhotoAria}
              >
                {removingId === photo.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
                )}
              </button>
            ) : null}
          </div>
        ))}

        {!readOnly && canAdd ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className={cn(
              "flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border/80",
              "bg-card/50 text-muted-foreground transition hover:border-primary/40 hover:bg-muted/30",
            )}
          >
            {uploading ? (
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            ) : (
              <ImagePlus className="h-5 w-5" strokeWidth={2} aria-hidden />
            )}
            <span className="px-1 text-center text-[10px] font-medium leading-tight">
              {uploading ? lp.uploading : lp.addPhoto}
            </span>
          </button>
        ) : null}
      </div>

      {!readOnly ? (
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={(e) => void onPickFile(e.target.files?.[0])}
        />
      ) : null}

      {photos.length === 0 && readOnly ? (
        <p className="text-[12px] text-muted-foreground">{lp.emptyPeer}</p>
      ) : null}

      {error ? <p className="text-[12px] text-destructive">{error}</p> : null}
    </div>
  );
}
