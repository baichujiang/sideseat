"use client";

import { apiFetch } from "@/lib/auth/api-fetch";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { AvatarCropEditor } from "@/components/profile/avatar-crop-editor";
import { PresetAvatar } from "@/components/ui/preset-avatar";
import { Button } from "@/components/ui/button";
import { AVATAR_IDS, isDisplayableCustomAvatarUrl, isValidAvatarId } from "@/lib/constants/avatars";
import { uploadProfileAvatarPhoto } from "@/lib/profile/upload-avatar";
import { cn } from "@/lib/utils";

const AVATAR_SHEET_PX = "h-[3.25rem] w-[3.25rem]"; /* 52px */

export function AvatarPicker({
  initialId,
  children,
  homepage = false,
  /** Me edit sheet: larger avatar, name field height matched, vertically centered row. */
  sheet = false,
}: {
  initialId: string | null;
  /** Rendered next to the avatar on the trigger row (usually the nickname input). */
  children?: React.ReactNode;
  /** Tighter home header: larger tap target, top-aligned with multi-line text. */
  homepage?: boolean;
  sheet?: boolean;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<string | null>(initialId);
  const [expanded, setExpanded] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setSelected(initialId);
  }, [initialId]);

  const choose = (id: string) => {
    if (isPending) return;
    const previous = selected;
    setSelected(id);
    setMessage("");
    startTransition(async () => {
      const response = await apiFetch("/api/profile/avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarId: id }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) {
        setSelected(previous);
        setMessage(payload.error ?? "Could not save avatar.");
        return;
      }
      setExpanded(false);
      router.refresh();
    });
  };

  const uploadCustom = (file: File) => {
    if (isPending) return;
    const previous = selected;
    setMessage("");
    startTransition(async () => {
      try {
        const url = await uploadProfileAvatarPhoto(file);
        setSelected(url);
        setExpanded(false);
        router.refresh();
      } catch (e) {
        setSelected(previous);
        setMessage(e instanceof Error ? e.message : "Could not upload photo.");
      }
    });
  };

  return (
    <div className={cn("space-y-2", homepage && "space-y-2.5")}>
      <div
        className={cn(
          "flex gap-3",
          homepage && !sheet ? "items-start" : "items-center",
        )}
      >
        <button
          aria-expanded={expanded}
          aria-label="Change avatar"
          className={cn(
            "shrink-0 rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            homepage && !sheet
              ? cn(
                  "bg-background shadow-sm ring-2",
                  expanded
                    ? "ring-primary ring-offset-2 ring-offset-background"
                    : "ring-border/55 hover:ring-primary/45",
                )
              : sheet
                ? cn(
                    "ring-2 ring-border/50 shadow-sm",
                    expanded ? "ring-primary ring-offset-2 ring-offset-background" : "hover:ring-primary/40",
                  )
                : expanded
                  ? "ring-2 ring-foreground ring-offset-2 ring-offset-background"
                  : "hover:opacity-90",
          )}
          onClick={() => setExpanded((open) => !open)}
          type="button"
        >
          <PresetAvatar
            className={cn(sheet ? AVATAR_SHEET_PX : homepage ? "h-[3.25rem] w-[3.25rem]" : "h-12 w-12")}
            id={selected}
          />
        </button>
        <div
          className={cn(
            "min-w-0 flex-1",
            sheet ? "flex min-h-[3.25rem] items-center" : "pt-px",
          )}
        >
          {children}
        </div>
      </div>
      {expanded ? (
        <div
          className={cn(
            "space-y-2 rounded-2xl border p-2",
            homepage
              ? "border-border/80 bg-card/95 shadow-sm backdrop-blur-sm"
              : "border-border bg-muted/30",
          )}
        >
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              if (!file.type.startsWith("image/")) {
                setMessage("Choose an image file.");
                return;
              }
              setCropFile(file);
            }}
          />
          {cropFile ? (
            <AvatarCropEditor
              file={cropFile}
              pending={isPending}
              className="px-1 py-1"
              onCancel={() => setCropFile(null)}
              onConfirm={async (nextFile) => {
                setCropFile(null);
                uploadCustom(nextFile);
              }}
            />
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 px-0.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isPending}
                  className="h-9 rounded-full px-4 text-[13px]"
                  onClick={() => fileRef.current?.click()}
                >
                  Upload photo
                </Button>
                {isDisplayableCustomAvatarUrl(selected) ? (
                  <span className="text-[11px] text-muted-foreground">Using your photo</span>
                ) : null}
                <span className="text-[10px] text-muted-foreground">Any image format · saved as square avatar</span>
              </div>
              <div className={cn("grid grid-cols-5 gap-2 sm:grid-cols-10")}>
                {AVATAR_IDS.map((id) => {
                  const isSelected = isValidAvatarId(selected) && id === selected;
                  return (
                    <button
                      aria-label={`Avatar ${id}`}
                      aria-pressed={isSelected}
                      className={cn(
                        "rounded-full transition",
                        isSelected
                          ? "ring-2 ring-foreground ring-offset-2 ring-offset-background"
                          : "opacity-80 hover:opacity-100",
                      )}
                      key={id}
                      onClick={() => choose(id)}
                      type="button"
                    >
                      <PresetAvatar className="h-10 w-10" id={id} />
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      ) : null}
      {message ? <p className="text-xs text-destructive">{message}</p> : null}
    </div>
  );
}
