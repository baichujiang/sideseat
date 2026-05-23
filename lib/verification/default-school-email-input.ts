import { StudentVerificationStatus } from "@prisma/client";

/**
 * Default value for school verification email fields.
 * Login/signup email lives on `User.email` too — do not pre-fill that when still UNVERIFIED.
 */
export function defaultSchoolVerificationEmailInput(
  status: StudentVerificationStatus,
  email: string | null | undefined,
): string {
  const trimmed = email?.trim() ?? "";
  if (!trimmed) return "";

  if (status === StudentVerificationStatus.UNVERIFIED) {
    return "";
  }

  if (status === StudentVerificationStatus.VERIFIED) {
    return "";
  }

  if (
    status === StudentVerificationStatus.EMAIL_PENDING ||
    status === StudentVerificationStatus.MANUAL_REVIEW_REQUIRED ||
    status === StudentVerificationStatus.REJECTED
  ) {
    return trimmed;
  }

  return "";
}
