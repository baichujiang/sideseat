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
 * Verified students show a school badge (e.g. TUM / LMU). Pending and
 * unverified users still render a lighter status badge so the trust state is
 * explicit without relying on a generic checkmark icon.
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
  const sizing =
    size === "xs"
      ? "px-1.5 py-0.5 text-[9px]"
      : "px-2 py-0.5 text-[10px]";

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
        }
      : effectiveStatus === "EMAIL_PENDING" ||
          effectiveStatus === "MANUAL_REVIEW_REQUIRED"
        ? {
            label: "Pending",
            title: "Student verification pending",
            className: "bg-amber-100 text-amber-800",
          }
        : {
            label: "Unverified",
            title: "Student not verified",
            className: "bg-slate-100 text-slate-600",
          };

  return (
    <span
      title={config.title}
      aria-label={config.title}
      className={cn(
        "inline-flex shrink-0 items-center rounded-full font-semibold",
        sizing,
        config.className,
        className,
      )}
    >
      {config.label}
    </span>
  );
}
