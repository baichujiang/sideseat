"use client";

import type { UserGender } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { apiFetch } from "@/lib/auth/api-fetch";
import { Button } from "@/components/ui/button";
import { USER_GENDER_OPTIONS } from "@/lib/constants/gender";
import { useAppMessages } from "@/hooks/use-app-locale";
import { cn } from "@/lib/utils";

const SAVE_RED = "bg-[#ff2442] text-white hover:bg-[#e61e3a]";

export function ProfileGenderEditor({ initialGender }: { initialGender: UserGender }) {
  const t = useAppMessages().meIdentity;
  const router = useRouter();
  const [selected, setSelected] = useState(initialGender);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const save = () => {
    setError("");
    startTransition(async () => {
      const res = await apiFetch("/api/profile/gender", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gender: selected }),
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
      <ul className="space-y-2">
        {USER_GENDER_OPTIONS.map((opt) => {
          const active = selected === opt.value;
          return (
            <li key={opt.value}>
              <button
                type="button"
                onClick={() => setSelected(opt.value)}
                className={cn(
                  "flex w-full items-center justify-between rounded-2xl border px-4 py-3.5 text-left text-[15px] transition",
                  active
                    ? "border-[#ff2442]/40 bg-[#ff2442]/5 font-semibold text-foreground"
                    : "border-border/70 bg-card text-foreground active:bg-muted/50",
                )}
              >
                <span>{opt.label}</span>
                {active ? <span className="text-[13px] text-[#ff2442]">✓</span> : null}
              </button>
            </li>
          );
        })}
      </ul>
      {error ? <p className="text-[12px] text-destructive">{error}</p> : null}
      <Button
        type="button"
        className={cn("h-11 w-full rounded-full text-[16px] font-medium", SAVE_RED)}
        disabled={pending || selected === initialGender}
        onClick={save}
      >
        {pending ? t.saving : t.save}
      </Button>
    </div>
  );
}
