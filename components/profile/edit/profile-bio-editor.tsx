"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { apiFetch } from "@/lib/auth/api-fetch";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAppMessages } from "@/hooks/use-app-locale";
import { homeProfileQuickSchema } from "@/lib/validators/profile";
import { cn } from "@/lib/utils";

const SAVE_RED = "bg-[#ff2442] text-white hover:bg-[#e61e3a]";

export function ProfileBioEditor({ initialBio }: { initialBio: string }) {
  const t = useAppMessages().meIdentity;
  const router = useRouter();
  const [draft, setDraft] = useState(initialBio);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const save = () => {
    setError("");
    const parsed = homeProfileQuickSchema.shape.bio.safeParse(draft.trim() === "" ? "" : draft.trim());
    if (!parsed.success) {
      setError(parsed.error.errors[0]?.message ?? t.errorInvalidBio);
      return;
    }
    startTransition(async () => {
      const res = await apiFetch("/api/profile/quick", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bio: parsed.data }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload.success) {
        setError(typeof payload.error === "string" ? payload.error : t.errorCouldNotSave);
        return;
      }
      router.push("/profile/info");
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <Textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        maxLength={120}
        rows={5}
        placeholder={t.bioFieldPlaceholder}
        className="min-h-[8rem] resize-none rounded-[20px] border-border bg-muted/40 text-[15px] leading-relaxed focus-visible:border-[#ff2442] focus-visible:ring-[#ff2442]/25"
      />
      <p className="text-right text-[11px] tabular-nums text-muted-foreground">{draft.length}/120</p>
      {error ? <p className="text-[12px] text-destructive">{error}</p> : null}
      <Button
        type="button"
        className={cn("h-11 w-full rounded-full text-[16px] font-medium", SAVE_RED)}
        disabled={pending}
        onClick={save}
      >
        {pending ? t.saving : t.save}
      </Button>
    </div>
  );
}
