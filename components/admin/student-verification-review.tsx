"use client";

import { StudentVerificationStatus } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function StudentVerificationReview({
  userId,
}: {
  userId: string;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const submit = (status: StudentVerificationStatus) => {
    startTransition(async () => {
      setError("");
      const response = await fetch(`/api/admin/verifications/${userId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status, note }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setError(payload?.error ?? "Unable to update verification.");
        return;
      }

      router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      <Textarea
        onChange={(event) => setNote(event.target.value)}
        placeholder="Review note for the applicant"
        value={note}
      />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="flex gap-2">
        <Button
          className="flex-1"
          disabled={isPending}
          onClick={() => submit(StudentVerificationStatus.VERIFIED)}
          type="button"
        >
          Approve
        </Button>
        <Button
          className="flex-1"
          disabled={isPending}
          onClick={() => submit(StudentVerificationStatus.REJECTED)}
          type="button"
          variant="outline"
        >
          Reject
        </Button>
      </div>
    </div>
  );
}
