"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { apiFetch } from "@/lib/auth/api-fetch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppMessages } from "@/hooks/use-app-locale";
import { mapNicknameApiError } from "@/lib/profile/nickname-api-errors";
import { homeProfileQuickSchema } from "@/lib/validators/profile";
import { cn } from "@/lib/utils";

const SAVE_RED = "bg-[#ff2442] text-white hover:bg-[#e61e3a]";

export function ProfileNicknameEditor({ initialNickname }: { initialNickname: string }) {
  const messages = useAppMessages();
  const t = messages.meIdentity;
  const pf = messages.profileForm;
  const router = useRouter();
  const [draft, setDraft] = useState(initialNickname);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const save = () => {
    setError("");
    const parsed = homeProfileQuickSchema.shape.nickname.safeParse(draft.trim());
    if (!parsed.success) {
      setError(parsed.error.errors[0]?.message ?? pf.unableToSave);
      return;
    }
    startTransition(async () => {
      const res = await apiFetch("/api/profile/quick", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname: parsed.data }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload.success) {
        setError(
          mapNicknameApiError(
            payload,
            { taken: pf.nicknameTaken, reserved: pf.nicknameReserved },
            t.errorCouldNotSave,
          ),
        );
        return;
      }
      router.push("/profile/info");
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        maxLength={32}
        autoComplete="nickname"
        placeholder={pf.nicknamePlaceholder}
        className="h-12 rounded-[20px] border-border bg-muted/40 text-[16px] focus-visible:border-[#ff2442] focus-visible:ring-[#ff2442]/25"
      />
      <p className="text-right text-[11px] tabular-nums text-muted-foreground">{draft.length}/32</p>
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
