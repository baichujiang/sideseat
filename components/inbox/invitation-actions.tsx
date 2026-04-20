"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/forms/form-message";

export function InvitationActions({ invitationId }: { invitationId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  const submit = (action: "accept" | "decline") => {
    startTransition(async () => {
      setError("");
      const response = await fetch(`/api/invitations/${invitationId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(
          typeof payload.error === "string" ? payload.error : "Could not update invitation.",
        );
        return;
      }

      router.refresh();
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Button disabled={pending} onClick={() => submit("accept")} size="sm" type="button">
          Accept
        </Button>
        <Button
          disabled={pending}
          onClick={() => submit("decline")}
          size="sm"
          type="button"
          variant="outline"
        >
          Decline
        </Button>
      </div>
      <FormMessage message={error} />
    </div>
  );
}
