"use client";

import { apiFetch } from "@/lib/auth/api-fetch";

import { ReportStatus } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const statuses = Object.values(ReportStatus);

export function ReportReviewForm({
  reportId,
  initialStatus,
  initialNotes,
}: {
  reportId: string;
  initialStatus: ReportStatus;
  initialNotes?: string | null;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<ReportStatus>(initialStatus);
  const [adminNotes, setAdminNotes] = useState(initialNotes ?? "");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  return (
    <div className="space-y-3">
      <select
        className="h-11 w-full rounded-2xl border border-border bg-background px-4 text-sm"
        onChange={(event) => setStatus(event.target.value as ReportStatus)}
        value={status}
      >
        {statuses.map((item) => (
          <option key={item} value={item}>
            {item.toLowerCase().replaceAll("_", " ")}
          </option>
        ))}
      </select>
      <Textarea
        onChange={(event) => setAdminNotes(event.target.value)}
        placeholder="Internal handling notes"
        value={adminNotes}
      />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button
        className="w-full"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            setError("");
            const response = await apiFetch(`/api/admin/reports/${reportId}`, {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ status, adminNotes }),
            });

            if (!response.ok) {
              const payload = await response.json().catch(() => null);
              setError(payload?.error ?? "Unable to update report.");
              return;
            }

            router.refresh();
          })
        }
        type="button"
      >
        {isPending ? "Saving..." : "Save review"}
      </Button>
    </div>
  );
}
