"use client";

import { apiFetch } from "@/lib/auth/api-fetch";

import { StudentVerificationStatus } from "@prisma/client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Input } from "@/components/ui/input";
import { getSchoolByCode } from "@/lib/constants/schools";
import { StatusBadge } from "@/components/ui/status-badge";
import type { SchoolCode } from "@/lib/constants/schools";
import { getSchoolLogoPath } from "@/lib/constants/schools";
import { cn } from "@/lib/utils";

const verifiedChipClass =
  "shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold leading-none text-classmates-success bg-classmates-success-soft";

type DeliveryKind = "sent" | "failed" | "skipped" | "manual";

function statusTone(status: StudentVerificationStatus) {
  if (status === StudentVerificationStatus.VERIFIED) return "calm";
  if (status === StudentVerificationStatus.EMAIL_PENDING) return "warm";
  if (status === StudentVerificationStatus.MANUAL_REVIEW_REQUIRED) return "warm";
  if (status === StudentVerificationStatus.REJECTED) return "danger";
  return "neutral";
}

export function StudentVerificationForm({
  currentStatus,
  email,
  schoolHint,
  /** Profile school code — used to show the school logo next to verification. */
  schoolCode,
  /** Short school label (e.g. TUM) — shown in verified-state trust copy. */
  schoolShortLabel,
  notes,
  hasProofUploaded,
}: {
  currentStatus: StudentVerificationStatus;
  email?: string | null;
  schoolHint: string;
  schoolCode?: SchoolCode | null;
  schoolShortLabel?: string | null;
  notes?: string | null;
  hasProofUploaded?: boolean;
}) {
  const router = useRouter();
  const [input, setInput] = useState(email ?? "");
  const [message, setMessage] = useState("");
  const [verifyUrl, setVerifyUrl] = useState("");
  const [delivery, setDelivery] = useState<DeliveryKind | "">("");
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Manual-review state
  const [showManual, setShowManual] = useState(
    currentStatus === StudentVerificationStatus.MANUAL_REVIEW_REQUIRED ||
      currentStatus === StudentVerificationStatus.REJECTED,
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [manualEmail, setManualEmail] = useState(email ?? "");
  const [manualMessage, setManualMessage] = useState("");
  const [manualError, setManualError] = useState("");
  const [isUploading, startUploadTransition] = useTransition();

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

      const response = await apiFetch("/api/student-verification/request", {
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

  const submitManual = () =>
    startUploadTransition(async () => {
      setManualError("");
      setManualMessage("");

      if (!selectedFile) {
        setManualError("Attach your enrollment certificate.");
        return;
      }

      const formData = new FormData();
      formData.append("file", selectedFile);
      if (manualEmail) formData.append("email", manualEmail);

      const response = await apiFetch("/api/student-verification/manual-review", {
        method: "POST",
        body: formData,
      });

      const payload = await response.json();

      if (!response.ok) {
        setManualError(payload.error ?? "Unable to submit for review.");
        return;
      }

      setManualMessage(payload.data?.message ?? "Submitted for review.");
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
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
  const schoolLogoSrc = getSchoolLogoPath(schoolCode);
  const schoolConfig = getSchoolByCode(schoolCode);
  const primaryVerificationDomain = schoolConfig?.verificationDomains[0] ?? "university.edu";
  const emailPlaceholder = `name@${primaryVerificationDomain}`;

  if (isVerified) {
    const displayEmail = email?.trim() || "—";
    const logoAlt = schoolShortLabel ? `${schoolShortLabel} logo` : "University logo";
    return (
      <div
        className="rounded-[20px] border border-[#D1FAE5] bg-[#FAFFFE] px-2.5 py-2 dark:border-emerald-900/40 dark:bg-emerald-950/20"
        role="status"
        aria-label={
          schoolShortLabel
            ? `Verified ${schoolShortLabel} school email: ${displayEmail}`
            : `Verified university email: ${displayEmail}`
        }
      >
        <div className="flex gap-3">
          {schoolLogoSrc ? (
            <div className="flex h-11 shrink-0 items-center justify-center self-start rounded-xl border border-emerald-200/80 bg-white px-2 py-1 shadow-[0_1px_2px_rgba(15,23,42,0.06)] dark:border-emerald-800/50 dark:bg-emerald-950/40">
              <img
                src={schoolLogoSrc}
                alt={logoAlt}
                className="h-7 w-auto max-w-[5.75rem] object-contain object-left"
                width={92}
                height={28}
                decoding="async"
              />
            </div>
          ) : null}
          <div className="min-w-0 flex-1 space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              University email
            </p>
            {schoolShortLabel ? (
              <p className="text-[12px] font-semibold leading-tight text-classmates-success dark:text-emerald-400">
                Verified {schoolShortLabel} email
              </p>
            ) : null}
            <div className="flex min-h-[1.75rem] items-center justify-between gap-2">
              <p className="min-w-0 truncate text-[13px] font-medium tabular-nums text-foreground">
                {displayEmail}
              </p>
              <span className={verifiedChipClass}>Verified</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {schoolLogoSrc ? (
            <img
              src={schoolLogoSrc}
              alt={schoolShortLabel ? `${schoolShortLabel} logo` : ""}
              className="h-7 w-auto max-w-[4.5rem] shrink-0 object-contain opacity-90 dark:opacity-95"
              width={72}
              height={28}
              decoding="async"
            />
          ) : null}
          <p className="text-xs font-medium text-muted-foreground">Student verification</p>
        </div>
        <StatusBadge tone={statusTone(currentStatus)}>
          {currentStatus.toLowerCase().replaceAll("_", " ")}
        </StatusBadge>
      </div>
      <div className="flex gap-2">
        <Input
          className="flex-1"
          onChange={(event) => setInput(event.target.value)}
          placeholder={emailPlaceholder}
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
        <div className="space-y-2 rounded-[24px] border border-border bg-[#faf7f1] p-3 text-xs">
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

      {showManual ? (
        <div className="space-y-2 rounded-[24px] border border-border bg-[#faf7f1] p-3 text-xs">
          <p className="font-medium">Manual review</p>
          <p className="text-[11px] text-muted-foreground">
            Upload your official {schoolShortLabel ?? "school"} enrollment certificate. PDF or image, up to 5 MB.
          </p>
          <Input
            ref={fileInputRef}
            accept="application/pdf,image/*"
            className="h-auto py-1.5 text-xs"
            onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
            type="file"
          />
          <Input
            className="text-xs"
            onChange={(event) => setManualEmail(event.target.value)}
            placeholder="TUM email (optional, e.g. name@tum.de)"
            type="email"
            value={manualEmail}
          />
          <div className="flex gap-2">
            <Button
              className="flex-1"
              disabled={isUploading}
              onClick={submitManual}
              size="sm"
              type="button"
            >
              {isUploading ? "Uploading…" : hasProofUploaded ? "Resubmit" : "Submit for review"}
            </Button>
            <Button
              onClick={() => setShowManual(false)}
              size="sm"
              type="button"
              variant="ghost"
            >
              Cancel
            </Button>
          </div>
          {manualError ? (
            <p className="text-[11px] text-[#9b3a3a]">{manualError}</p>
          ) : null}
          {manualMessage ? (
            <p className="text-[11px] text-[#1f5d47]">{manualMessage}</p>
          ) : null}
          {hasProofUploaded && !manualMessage ? (
            <p className="text-[11px] text-muted-foreground">
              An enrollment certificate is on file and pending review.
            </p>
          ) : null}
        </div>
      ) : (
        <button
          className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          onClick={() => setShowManual(true)}
          type="button"
        >
          Can&apos;t receive the email? Upload enrollment certificate instead
        </button>
      )}
    </div>
  );
}
