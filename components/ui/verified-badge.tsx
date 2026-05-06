import { cn } from "@/lib/utils";

type VerificationStatus =
  | "UNVERIFIED"
  | "EMAIL_PENDING"
  | "VERIFIED"
  | "MANUAL_REVIEW_REQUIRED"
  | "REJECTED";

function schoolBadgeTone(school?: string | null) {
  const normalized = school?.trim().toUpperCase();
  if (normalized === "LMU") {
    return "bg-emerald-100 text-emerald-800";
  }
  if (normalized === "TUM") {
    return "bg-sky-100 text-sky-800";
  }
  return "bg-slate-100 text-slate-700";
}

function schoolBadgeLabel(school?: string | null) {
  const normalized = school?.trim().toUpperCase();
  if (!normalized) return "Verified";
  return normalized;
}

/**
 * Identity badge used next to a person's name.
 *
 * Verified students show a school badge (e.g. TUM / LMU). In-progress
 * verification uses a smaller amber chip (not chat “request sent”). Unverified
 * users get a neutral badge so trust state stays explicit.
 */
export function VerifiedBadge({
  size = "sm",
  className,
  school,
  verifiedStudent = false,
  status,
}: {
  size?: "sm" | "xs";
  className?: string;
  school?: string | null;
  verifiedStudent?: boolean;
  status?: VerificationStatus | null;
}) {
  const schoolSizing =
    size === "xs"
      ? "px-1.5 py-0.5 text-[9px]"
      : "px-2 py-0.5 text-[10px]";

  /** Smaller than school pill — reads as a secondary status chip. */
  const verificationPendingSizing = "px-1 py-0.5 text-[8px] leading-tight";

  const verificationPendingTone = cn(
    "border border-[#FDE68A] bg-[#FEF3C7] font-semibold text-[#92400E]",
    "dark:border-amber-500/40 dark:bg-amber-950/45 dark:text-amber-100",
  );

  const effectiveStatus: VerificationStatus =
    status ?? (verifiedStudent ? "VERIFIED" : "UNVERIFIED");

  const config =
    effectiveStatus === "VERIFIED"
      ? {
          label: schoolBadgeLabel(school),
          title: school
            ? `Verified ${schoolBadgeLabel(school)} student`
            : "Verified student",
          className: schoolBadgeTone(school),
          sizing: schoolSizing,
        }
      : effectiveStatus === "EMAIL_PENDING"
        ? {
            label: "Awaiting email",
            title: "School verification — waiting for email confirmation (not a chat request).",
            className: verificationPendingTone,
            sizing: verificationPendingSizing,
          }
        : effectiveStatus === "MANUAL_REVIEW_REQUIRED"
          ? {
              label: "Staff review",
              title: "School verification — waiting for staff review (not a chat request).",
              className: verificationPendingTone,
              sizing: verificationPendingSizing,
            }
          : {
              label: "Unverified",
              title: "Student not verified",
              className: "bg-slate-100 text-slate-600",
              sizing: schoolSizing,
            };

  return (
    <span
      title={config.title}
      aria-label={config.title}
      className={cn(
        "inline-flex shrink-0 items-center rounded-full font-semibold",
        config.sizing,
        config.className,
        className,
      )}
    >
      {config.label}
    </span>
  );
}
