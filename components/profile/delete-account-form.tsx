"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { setAccessToken } from "@/lib/auth/client-access-token";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

export function DeleteAccountForm({ username }: { username: string }) {
  const router = useRouter();
  const [understood, setUnderstood] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matches = confirmText === username;
  const canSubmit = understood && matches && !busy;

  return (
    <div className="space-y-5 rounded-2xl border border-classmates-edge bg-classmates-surface p-4 shadow-[0_4px_14px_rgba(15,23,42,0.04)] dark:border-border dark:bg-card">
      <ul className="list-inside list-disc space-y-1.5 text-[13px] leading-relaxed text-muted-foreground">
        <li>Your profile, courses, calendar, messages, and connections will be removed.</li>
        <li>Group chats you created will be deleted for all members.</li>
        <li>This cannot be undone.</li>
      </ul>

      <Checkbox
        checked={understood}
        onChange={setUnderstood}
        label="I understand this permanently deletes my account and data."
      />

      <div className="space-y-2">
        <label className="block text-[13px] font-medium text-foreground" htmlFor="delete-account-confirm">
          Type your username <span className="font-mono text-foreground">{username}</span> to confirm
        </label>
        <Input
          id="delete-account-confirm"
          name="confirmUsername"
          autoComplete="off"
          spellCheck={false}
          value={confirmText}
          onChange={(e) => {
            setConfirmText(e.target.value);
            setError(null);
          }}
          placeholder={username}
          aria-invalid={confirmText.length > 0 && !matches}
        />
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Button
        type="button"
        variant="destructive"
        className="w-full"
        disabled={!canSubmit}
        onClick={async () => {
          if (!canSubmit) return;
          setBusy(true);
          setError(null);
          try {
            const res = await fetch("/api/account/delete", {
              method: "POST",
              credentials: "include",
              headers: { Accept: "application/json" },
            });
            if (!res.ok) {
              const body = (await res.json().catch(() => null)) as { error?: string } | null;
              setError(body?.error ?? "Something went wrong. Try again.");
              setBusy(false);
              return;
            }
            setAccessToken(null);
            router.push("/login");
            router.refresh();
          } catch {
            setError("Network error. Check your connection and try again.");
            setBusy(false);
          }
        }}
      >
        {busy ? "Deleting…" : "Delete my account"}
      </Button>
    </div>
  );
}
