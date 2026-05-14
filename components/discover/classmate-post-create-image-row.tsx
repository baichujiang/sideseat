"use client";

import { ChevronLeft, ChevronRight, ImagePlus, Loader2, X } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { useAppMessages } from "@/hooks/use-app-locale";
import { formatMessage } from "@/lib/i18n/messages";
import { uploadClassmatePostImage } from "@/lib/discover/upload-classmate-post-image";
import { cn } from "@/lib/utils";
import { CLASSMATE_POST_MAX_IMAGES } from "@/lib/validators/classmate-posts";

export function ClassmatePostCreateImageRow({
  urls,
  onUrlsChange,
  disabled,
  onError,
}: {
  urls: string[];
  onUrlsChange: (next: string[]) => void;
  disabled: boolean;
  onError: (message: string) => void;
}) {
  const m = useAppMessages();
  const dl = m.discoverList;
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function onFileSelected(file: File | undefined) {
    if (!file || disabled || uploading) return;
    if (urls.length >= CLASSMATE_POST_MAX_IMAGES) {
      onError(formatMessage(dl.postErrorImageMax, { max: CLASSMATE_POST_MAX_IMAGES }));
      return;
    }
    setUploading(true);
    try {
      const url = await uploadClassmatePostImage(file);
      onUrlsChange([...urls, url].slice(0, CLASSMATE_POST_MAX_IMAGES));
    } catch (e) {
      onError(e instanceof Error ? e.message : dl.postErrorImageUpload);
    } finally {
      setUploading(false);
    }
  }

  function removeAt(index: number) {
    onUrlsChange(urls.filter((_, i) => i !== index));
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= urls.length) return;
    const next = [...urls];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onUrlsChange(next);
  }

  const canAdd = urls.length < CLASSMATE_POST_MAX_IMAGES && !disabled && !uploading;

  return (
    <div className="rounded-2xl border border-border/70 bg-card/50 px-3 py-2.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium text-muted-foreground">{dl.postSheetPhotosLabel}</p>
        <p className="text-[11px] text-muted-foreground/90">
          {formatMessage(dl.postSheetPhotosHint, { max: CLASSMATE_POST_MAX_IMAGES })}
        </p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={(e) => {
          void onFileSelected(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      <div className="flex flex-wrap items-center gap-2">
        {urls.map((url, index) => (
          <div
            key={`${url.slice(0, 48)}-${index}`}
            className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-border/60 bg-muted/60"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- preview of uploaded blob/data URL */}
            <img src={url} alt="" className="h-full w-full object-cover" />
            <div className="absolute inset-x-0 bottom-0 flex justify-center gap-0.5 bg-gradient-to-t from-black/55 to-transparent pb-1 pt-4 opacity-0 transition group-hover:opacity-100 sm:opacity-100">
              <button
                type="button"
                className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-foreground shadow-sm disabled:opacity-40"
                disabled={index === 0 || disabled}
                aria-label={dl.postSheetPhotoMoveLeftAria}
                onClick={() => move(index, index - 1)}
              >
                <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2.5} />
              </button>
              <button
                type="button"
                className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-foreground shadow-sm disabled:opacity-40"
                disabled={index === urls.length - 1 || disabled}
                aria-label={dl.postSheetPhotoMoveRightAria}
                onClick={() => move(index, index + 1)}
              >
                <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.5} />
              </button>
            </div>
            <button
              type="button"
              className="absolute right-0.5 top-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white shadow-sm backdrop-blur-sm"
              disabled={disabled}
              aria-label={formatMessage(dl.postSheetPhotoRemoveAria, { index: index + 1 })}
              onClick={() => removeAt(index)}
            >
              <X className="h-3.5 w-3.5" strokeWidth={2.5} />
            </button>
          </div>
        ))}

        {canAdd ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(
              "h-16 w-[4.5rem] shrink-0 flex-col gap-0.5 rounded-xl border-dashed px-1 text-[10px] font-medium",
            )}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <ImagePlus className="h-4 w-4 opacity-80" aria-hidden />
            )}
            {uploading ? dl.postSheetPhotosUploading : dl.postSheetAddPhoto}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
