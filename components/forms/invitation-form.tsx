"use client";

import { InvitationType } from "@prisma/client";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { buildClientContext } from "@/lib/client/install-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormMessage } from "@/components/forms/form-message";

const invitationTypes = Object.values(InvitationType);

export function InvitationForm({
  receiverId,
  courseId,
  disabled = false,
  disabledReason = "",
}: {
  receiverId: string;
  courseId: string;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const router = useRouter();
  const [type, setType] = useState<InvitationType>(InvitationType.STUDY_TOGETHER);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = async () => {
    if (disabled) {
      setError(disabledReason || "You cannot send invitations right now.");
      return;
    }

    setIsSubmitting(true);
    setError("");

    const response = await fetch("/api/invitations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        receiverId,
        courseId,
        type,
        note,
        clientContext: buildClientContext(),
      }),
    });

    const payload = await response.json();

    if (!response.ok) {
      setError(payload.error ?? "Could not send invitation.");
      setIsSubmitting(false);
      return;
    }

    router.refresh();
    setNote("");
    setIsSubmitting(false);
  };

  return (
    <div className="space-y-3 rounded-3xl border border-border bg-card p-4">
      <p className="text-sm font-medium">Send a low-pressure invitation</p>
      <select
        className="field-select"
        value={type}
        onChange={(event) => setType(event.target.value as InvitationType)}
      >
        {invitationTypes.map((invitationType) => (
          <option key={invitationType} value={invitationType}>
            {invitationType.toLowerCase().replaceAll("_", " ")}
          </option>
        ))}
      </select>
      <Input
        disabled={disabled}
        placeholder="Optional short note"
        value={note}
        onChange={(event) => setNote(event.target.value)}
      />
      <FormMessage message={error || disabledReason} />
      <Button
        className="w-full"
        disabled={disabled || isSubmitting}
        onClick={onSubmit}
        type="button"
      >
        {disabled ? "Student verification required" : isSubmitting ? "Sending..." : "Send invitation"}
      </Button>
    </div>
  );
}
