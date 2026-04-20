"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FormMessage } from "@/components/forms/form-message";

export function MessageForm({ connectionId }: { connectionId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!body.trim()) return;

    setSubmitting(true);
    setError("");

    const response = await fetch(`/api/connections/${connectionId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });

    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error ?? "Unable to send message.");
      setSubmitting(false);
      return;
    }

    setBody("");
    setSubmitting(false);
    router.refresh();
  };

  return (
    <div className="space-y-3">
      <Textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder="Keep it light: suggest a time, place, or quick hello."
      />
      <FormMessage message={error} />
      <Button className="w-full" disabled={submitting} onClick={submit} type="button">
        {submitting ? "Sending..." : "Send message"}
      </Button>
    </div>
  );
}
