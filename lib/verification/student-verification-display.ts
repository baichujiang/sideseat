import { StudentVerificationStatus } from "@prisma/client";

import type { AppMessages } from "@/lib/i18n/messages/types";

export function studentVerificationStatusLabel(
  status: StudentVerificationStatus,
  t: AppMessages["studentVerification"],
): string {
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

/** Short value for profile info list row. */
export function studentVerificationRowValue(
  status: StudentVerificationStatus,
  t: AppMessages["studentVerification"],
  email: string | null | undefined,
): string {
  if (status === StudentVerificationStatus.VERIFIED) {
    const trimmed = email?.trim();
    return trimmed || t.statusVerified;
  }
  return studentVerificationStatusLabel(status, t);
}
