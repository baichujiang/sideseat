"use client";

import { StudentVerificationStatus } from "@prisma/client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";

type DeliveryKind = "sent" | "failed" | "skipped" | "manual";

function statusTone(status: StudentVerificationStatus) {
  if (status === StudentVerificationStatus.VERIFIED) return "calm";
  if (status === StudentVerificationStatus.EMAIL_PENDING) return "warm";
  if (status === StudentVerificationStatus.MANUAL_REVIEW_REQUIRED) return "danger";
  if (status === StudentVerificationStatus.REJECTED) return "danger";
  return "neutral";
}

export function StudentVerificationForm({
  currentStatus,
  email,
  schoolHint,
  notes,
}: {
  currentStatus: StudentVerificationStatus;
  email?: string | null;
  schoolHint: string;
  notes?: string | null;
}) {
  const router = useRouter();
  const [input, setInput] = useState(email ?? "");
  const [message, setMessage] = useState("");
  const [verifyUrl, setVerifyUrl] = useState("");
  const [delivery, setDelivery] = useState<DeliveryKind | "">("");
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();

  const deliveryTone =
    delivery === "sent"
      ? "text-[#1f5d47]"
      : delivery === "failed"
        ? "text-[#9b3a3a]"
        : "text-muted-foreground";

  const submit = () =>
    startTransition(async () => {
      setMessage("");
      setVerifyUrl("");
      setDelivery("");
      setCopied(false);

      const response = await fetch("/api/student-verification/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: input }),
      });

      const payload = await response.json();

      if (!response.ok) {
        setMessage(payload.error ?? "Unable to request verification.");
        return;
      }

      setMessage(payload.data?.message ?? "");
      setVerifyUrl(payload.data?.verifyUrl ?? "");
      setDelivery((payload.data?.delivery as DeliveryKind) ?? "");
      router.refresh();
    });

  const copyLink = async () => {
    if (!verifyUrl) return;
    try {
      await navigator.clipboard.writeText(verifyUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const isVerified = currentStatus === StudentVerificationStatus.VERIFIED;

  if (isVerified) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-[#d5e9df] bg-[#eef8f2] px-3 py-2">
        <p className="truncate text-sm">{email}</p>
        <StatusBadge tone="calm">verified</StatusBadge>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">Student verification</p>
        <StatusBadge tone={statusTone(currentStatus)}>
          {currentStatus.toLowerCase().replaceAll("_", " ")}
        </StatusBadge>
      </div>
      <div className="flex gap-2">
        <Input
          className="flex-1"
          onChange={(event) => setInput(event.target.value)}
          placeholder="name@tum.de"
          type="email"
          value={input}
        />
        <Button disabled={isPending} onClick={submit} type="button">
          {isPending ? "Sending…" : "Verify"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{schoolHint}</p>

      {notes ? <p className="text-sm text-foreground">{notes}</p> : null}
      {message ? <p className={`text-sm ${deliveryTone}`}>{message}</p> : null}

      {verifyUrl ? (
        <div className="space-y-2 rounded-2xl border border-border bg-[#faf7f1] p-3 text-xs">
          <p className="font-medium">Verification link</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <a
              className={cn(buttonVariants({ size: "sm" }), "sm:flex-1")}
              href={verifyUrl}
              rel="noreferrer"
            >
              Open link
            </a>
            <Button
              className="sm:flex-1"
              onClick={copyLink}
              size="sm"
              type="button"
              variant="outline"
            >
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <a className="block break-all text-[11px] text-muted-foreground underline" href={verifyUrl}>
            {verifyUrl}
          </a>
        </div>
      ) : null}
    </div>
  );
}
