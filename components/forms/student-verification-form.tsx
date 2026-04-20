"use client";

import { StudentVerificationStatus } from "@prisma/client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardTitle } from "@/components/ui/card";
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
      <Card className="flex items-center justify-between gap-3">
        <div>
          <CardTitle className="text-base">Student</CardTitle>
          <p className="text-sm text-muted-foreground">{email}</p>
        </div>
        <StatusBadge tone="calm">verified</StatusBadge>
      </Card>
    );
  }

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <CardTitle className="text-base">Student verification</CardTitle>
        <StatusBadge tone={statusTone(currentStatus)}>
          {currentStatus.toLowerCase().replaceAll("_", " ")}
        </StatusBadge>
      </div>

      <div className="space-y-2">
        <Input
          onChange={(event) => setInput(event.target.value)}
          placeholder="name@tum.de"
          type="email"
          value={input}
        />
        <Button className="w-full" disabled={isPending} onClick={submit} type="button">
          {isPending ? "Sending…" : "Send verification email"}
        </Button>
        <p className="text-xs text-muted-foreground">{schoolHint}</p>
      </div>

      {notes ? <p className="text-sm text-foreground">{notes}</p> : null}
      {message ? <p className={`text-sm ${deliveryTone}`}>{message}</p> : null}

      {verifyUrl ? (
        <div className="space-y-2 rounded-2xl border border-border bg-[#faf7f1] p-3 text-sm">
          <p className="font-medium">Verification link</p>
          <p className="text-xs text-muted-foreground">
            Works even if the email didn&apos;t arrive. Open it from the device signed in to this
            account.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <a
              className={cn(buttonVariants({ size: "sm" }), "sm:flex-1")}
              href={verifyUrl}
              rel="noreferrer"
            >
              Open verification link
            </a>
            <Button
              className="sm:flex-1"
              onClick={copyLink}
              size="sm"
              type="button"
              variant="outline"
            >
              {copied ? "Copied" : "Copy link"}
            </Button>
          </div>
          <a className="block break-all text-[11px] text-muted-foreground underline" href={verifyUrl}>
            {verifyUrl}
          </a>
        </div>
      ) : null}
    </Card>
  );
}
