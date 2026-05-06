"use client";

import { apiFetch } from "@/lib/auth/api-fetch";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";

export function AdminBlockButton({
  reportId,
  blocked,
}: {
  reportId: string;
  blocked: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  return (
    <div className="space-y-2">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button
        className="w-full"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            setError("");
            const response = await apiFetch(`/api/admin/reports/${reportId}/block`, {
              method: blocked ? "DELETE" : "POST",
            });

            if (!response.ok) {
              const payload = await response.json().catch(() => null);
              setError(payload?.error ?? "Unable to create moderation block.");
              return;
            }

            router.refresh();
          })
        }
        type="button"
        variant="destructive"
      >
        {blocked
          ? isPending
            ? "Removing block..."
            : "Remove platform block"
          : isPending
            ? "Blocking..."
            : "Block user platform-wide"}
      </Button>
    </div>
  );
}
