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
import { useAppMessages } from "@/hooks/use-app-locale";
import { formatMessage } from "@/lib/i18n/messages";
import type { AppMessages } from "@/lib/i18n/messages/types";

const verifiedChipClass =
  "shrink-0 self-center rounded-full bg-[#D1FAE5] px-2.5 py-1 text-xs font-semibold leading-none text-[#047857] dark:bg-emerald-900/40 dark:text-emerald-300";

type DeliveryKind = "sent" | "failed" | "skipped" | "manual";

function verificationStatusLabel(status: StudentVerificationStatus, t: AppMessages["studentVerification"]): string {
  switch (status) {
    case StudentVerificationStatus.UNVERIFIED:
      return t.statusUnverified;
    case StudentVerificationStatus.EMAIL_PENDING:
      return t.statusEmailPending;
    case StudentVerificationStatus.VERIFIED:
      return t.statusVerified;
    case StudentVerificationStatus.MANUAL_REVIEW_REQUIRED:
      return t.statusManualReviewRequired;
    case StudentVerificationStatus.REJECTED:
      return t.statusRejected;
    default:
      return t.statusUnverified;
  }
}

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
  /** Profile school code — used to show the school logo next to verification. */
  schoolCode,
  /** Short school label (e.g. TUM) — shown in verified-state trust copy. */
  schoolShortLabel,
  notes,
  hasProofUploaded,
}: {
  currentStatus: StudentVerificationStatus;
  email?: string | null;
  schoolCode?: SchoolCode | null;
  schoolShortLabel?: string | null;
  notes?: string | null;
  hasProofUploaded?: boolean;
}) {
  const { studentVerification: v, common } = useAppMessages();
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
        setMessage(payload.error ?? v.errorRequestFailed);
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
        setManualError(v.errorAttachCertificate);
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
        setManualError(payload.error ?? v.errorManualSubmitFailed);
        return;
      }

      setManualMessage(payload.data?.message ?? v.submittedForReviewFallback);
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
  const verificationDomains = schoolConfig?.verificationDomains ?? [];
  const emailPlaceholder =
    verificationDomains.length === 0
      ? v.emailPlaceholderGeneric
      : verificationDomains.map((d) => `name@${d}`).join(" / ");
  const manualEmailPlaceholder =
    verificationDomains.length === 0
      ? v.manualEmailOptionalGeneric
      : formatMessage(v.manualEmailOptionalWithDomain, {
          examples: verificationDomains.map((d) => `name@${d}`).join(" / "),
        });

  if (isVerified) {
    const displayEmail = email?.trim() || "—";
    const logoAlt = schoolShortLabel
      ? formatMessage(v.logoAltWithSchool, { school: schoolShortLabel })
      : v.logoAltUniversity;
    return (
      <div
        className="rounded-[20px] border border-emerald-200 bg-emerald-50/50 px-4 py-3.5 dark:border-emerald-900/40 dark:bg-emerald-950/25"
        role="status"
        aria-label={
          schoolShortLabel
            ? formatMessage(v.verifiedAriaWithSchool, { school: schoolShortLabel, email: displayEmail })
            : formatMessage(v.verifiedAriaGeneric, { email: displayEmail })
        }
      >
        <div className="flex items-center gap-3">
          {schoolLogoSrc ? (
            <div className="flex h-11 shrink-0 items-center justify-center rounded-xl border border-emerald-200/80 bg-white px-2 py-1 shadow-[0_1px_2px_rgba(15,23,42,0.06)] dark:border-emerald-800/50 dark:bg-emerald-950/40">
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
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-classmates-sub">
              {v.universityEmailLabel}
            </p>
            {schoolShortLabel ? (
              <p className="text-sm font-semibold leading-tight text-classmates-success dark:text-emerald-400">
                {formatMessage(v.verifiedLineWithSchool, { school: schoolShortLabel })}
              </p>
            ) : null}
            <p className="truncate text-sm font-medium tabular-nums text-classmates-ink dark:text-foreground">
              {displayEmail}
            </p>
          </div>
          <span className={verifiedChipClass}>{v.verifiedChip}</span>
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
              alt={schoolShortLabel ? formatMessage(v.logoAltWithSchool, { school: schoolShortLabel }) : ""}
              className="h-7 w-auto max-w-[4.5rem] shrink-0 object-contain opacity-90 dark:opacity-95"
              width={72}
              height={28}
              decoding="async"
            />
          ) : null}
          <p className="text-xs font-medium text-muted-foreground">{v.heading}</p>
        </div>
        <StatusBadge tone={statusTone(currentStatus)}>
          {verificationStatusLabel(currentStatus, v)}
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
          {isPending ? v.sending : v.verifyCta}
        </Button>
      </div>

      {notes ? <p className="text-sm text-foreground">{notes}</p> : null}
      {message ? <p className={`text-sm ${deliveryTone}`}>{message}</p> : null}

      {verifyUrl ? (
        <div className="space-y-2 rounded-[24px] border border-border bg-[#faf7f1] p-3 text-xs">
          <p className="font-medium">{v.verificationLinkHeading}</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <a
              className={cn(buttonVariants({ size: "sm" }), "sm:flex-1")}
              href={verifyUrl}
              rel="noreferrer"
            >
              {v.openLink}
            </a>
            <Button
              className="sm:flex-1"
              onClick={copyLink}
              size="sm"
              type="button"
              variant="outline"
            >
              {copied ? v.copied : v.copy}
            </Button>
          </div>
          <a className="block break-all text-[11px] text-muted-foreground underline" href={verifyUrl}>
            {verifyUrl}
          </a>
        </div>
      ) : null}

      {showManual ? (
        <div className="space-y-2 rounded-[24px] border border-border bg-[#faf7f1] p-3 text-xs">
          <p className="font-medium">{v.manualReviewHeading}</p>
          <p className="text-[11px] text-muted-foreground">
            {formatMessage(v.manualReviewBody, { school: schoolShortLabel ?? v.schoolWord })}
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
            placeholder={manualEmailPlaceholder}
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
              {isUploading ? v.uploading : hasProofUploaded ? v.resubmit : v.submitForReview}
            </Button>
            <Button
              onClick={() => setShowManual(false)}
              size="sm"
              type="button"
              variant="ghost"
            >
              {common.cancel}
            </Button>
          </div>
          {manualError ? (
            <p className="text-[11px] text-[#9b3a3a]">{manualError}</p>
          ) : null}
          {manualMessage ? (
            <p className="text-[11px] text-[#1f5d47]">{manualMessage}</p>
          ) : null}
          {hasProofUploaded && !manualMessage ? (
            <p className="text-[11px] text-muted-foreground">{v.pendingFileNote}</p>
          ) : null}
        </div>
      ) : (
        <button
          className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          onClick={() => setShowManual(true)}
          type="button"
        >
          {v.cantEmailUploadLink}
        </button>
      )}
    </div>
  );
}
