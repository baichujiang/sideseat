"use client";

import { Heart } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useAppMessages } from "@/hooks/use-app-locale";
import { apiFetch } from "@/lib/auth/api-fetch";
import { cn } from "@/lib/utils";

export function ClassmatePostSaveButton({
  postId,
  initialSaved,
  className,
}: {
  postId: string;
  initialSaved: boolean;
  className?: string;
}) {
  const router = useRouter();
  const t = useAppMessages().savedClassmatePosts;
  const [saved, setSaved] = useState(initialSaved);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setSaved(initialSaved);
  }, [initialSaved, postId]);

  async function toggle(e?: React.MouseEvent) {
    e?.preventDefault();
    e?.stopPropagation();
    if (pending) return;
    setPending(true);
    try {
      if (saved) {
        const res = await apiFetch(`/api/classmate-posts/${encodeURIComponent(postId)}/save`, {
          method: "DELETE",
        });
        if (!res.ok) return;
        setSaved(false);
      } else {
        const res = await apiFetch(`/api/classmate-posts/${encodeURIComponent(postId)}/save`, {
          method: "POST",
        });
        if (!res.ok) return;
        setSaved(true);
      }
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  const ariaLabel = saved ? t.unsaveAria : t.saveAria;

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-label={ariaLabel}
      aria-pressed={saved}
      title={ariaLabel}
      className={cn(
        "inline-flex size-11 shrink-0 items-center justify-center rounded-full text-red-500 transition disabled:opacity-60",
        saved ? "hover:bg-red-500/10" : "hover:bg-red-500/10 hover:text-red-600",
        className,
      )}
    >
      <Heart
        className={cn("size-6", saved ? "fill-red-500 text-red-500" : "fill-none")}
        strokeWidth={2}
        aria-hidden
      />
    </button>
  );
}
