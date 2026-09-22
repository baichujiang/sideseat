import type {
  ActionCoordinationJsonObject,
  RouteRecoveryDTO,
} from "./dto";
import {
  ActionCoordinationConflict,
  type ActionCoordinationConflictCode,
  safetyUnavailable,
} from "./errors";

export type ActionCoordinationEligibilityResult<
  TValue,
  TCurrentState extends ActionCoordinationJsonObject = ActionCoordinationJsonObject,
> =
  | { eligible: true; value: TValue }
  | {
      eligible: false;
      exposure: "AUTHORITATIVE_CONFLICT";
      code: ActionCoordinationConflictCode;
      message: string;
      currentState: TCurrentState;
      recovery: RouteRecoveryDTO;
    }
  | {
      eligible: false;
      exposure: "SAFETY_UNAVAILABLE";
      publicStatus: 403 | 404;
    };

/**
 * Convert an internal eligibility decision into the privacy-safe command error.
 * The safety branch intentionally carries no internal Block/moderation reason.
 */
export function requireActionCoordinationEligibility<
  TValue,
  TCurrentState extends ActionCoordinationJsonObject,
>(
  result: ActionCoordinationEligibilityResult<TValue, TCurrentState>,
): TValue {
  if (result.eligible) return result.value;
  if (result.exposure === "SAFETY_UNAVAILABLE") {
    throw safetyUnavailable(result.publicStatus);
  }
  throw new ActionCoordinationConflict(
    result.code,
    result.message,
    result.currentState,
    result.recovery,
  );
}
