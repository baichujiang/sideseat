"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function AvatarPicker({
  initialUrl,
  nickname,
}: {
  initialUrl: string | null;
  nickname: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(initialUrl);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setPreview(initialUrl);
  }, [initialUrl]);

  const display = preview;
  const initial = (nickname.trim().slice(0, 1) || "?").toUpperCase();

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Photo</p>
      <div className="flex items-center gap-4">
        <div
          className={cn(
            "relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-muted text-xl font-semibold text-muted-foreground",
          )}
        >
          {display ? (
            <Image
              alt=""
              className="object-cover"
              fill
              sizes="80px"
              src={display}
              unoptimized
            />
          ) : (
            initial
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <input
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            ref={inputRef}
            type="file"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              setMessage("");
              startTransition(async () => {
                const formData = new FormData();
                formData.set("file", file);
                const response = await fetch("/api/profile/avatar", {
                  method: "POST",
                  body: formData,
                });
                const payload = await response.json();
                if (!response.ok || !payload.success) {
                  setMessage(payload.error ?? "Upload failed.");
                  return;
                }
                const url = payload.data?.url as string;
                if (url) setPreview(url);
                router.refresh();
              });
            }}
          />
          <Button
            disabled={isPending}
            type="button"
            variant="outline"
            className="w-full sm:w-auto"
            onClick={() => inputRef.current?.click()}
          >
            {isPending ? "Uploading…" : "Upload photo"}
          </Button>
          <p className="text-xs text-muted-foreground">JPG, PNG or WebP · max 2MB</p>
          {message ? <p className="text-xs text-destructive">{message}</p> : null}
        </div>
      </div>
    </div>
  );
}
