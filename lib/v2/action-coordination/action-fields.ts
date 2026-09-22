import type {
  ActionCoordinationPolicy,
  ClassmatePostCategory,
  ClassmatePostReplyPreference,
} from "@prisma/client";

export type ActionPolicyFieldInput = Readonly<{
  policy: ActionCoordinationPolicy | null | undefined;
  category: ClassmatePostCategory;
  courseIds: readonly string[];
  replyPreference: ClassmatePostReplyPreference;
  capacity: number | null | undefined;
}>;

export type ActionPolicyFieldProjection = Readonly<{
  courseIds: readonly string[];
  replyPreference: ClassmatePostReplyPreference;
  capacity: number | null;
  courseSelectionValid: boolean;
}>;

/**
 * Keep legacy presentation fields from creating a second product model for a
 * CREATOR_GATED_V2 Action. The policy is immutable, so the same projection is
 * used on create and every later edit.
 */
export function projectActionPolicyFields(
  input: ActionPolicyFieldInput,
): ActionPolicyFieldProjection {
  const courseIds = Object.freeze([...new Set(input.courseIds)]);
  if (input.policy !== "CREATOR_GATED_V2") {
    return Object.freeze({
      courseIds,
      replyPreference: input.replyPreference,
      capacity: input.capacity ?? null,
      courseSelectionValid: true,
    });
  }

  return Object.freeze({
    courseIds,
    // Creator-gated Actions have one Interest → coordination path. This legacy
    // field must never reopen a parallel direct-message response route.
    replyPreference: "REQUEST_FIRST",
    // Peer Actions are one-to-one. Legacy multi-person capacity is neither
    // displayed nor authoritative for this policy.
    capacity: null,
    courseSelectionValid:
      input.category !== "SHARED_COURSES" || courseIds.length === 1,
  });
}
