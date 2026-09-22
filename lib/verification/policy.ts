import { subDays } from "date-fns";

export const MANUAL_REVIEW_PROOF_RETENTION_DAYS = 30;

export function manualReviewProofCutoff(now = new Date()): Date {
  return subDays(now, MANUAL_REVIEW_PROOF_RETENTION_DAYS);
}
