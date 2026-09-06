import type {
  ActionCoordinationJsonObject,
  RouteRecoveryDTO,
} from "./dto";

export type ActionCoordinationErrorCode =
  | "CLIENT_CAPABILITY_REQUIRED"
  | "COORDINATION_POLICY_UNSUPPORTED"
  | "ACTION_CLOSED"
  | "ACTION_EXPIRED"
  | "ACTION_FULFILLED"
  | "INTEREST_NOT_ACTIVE"
  | "INTEREST_WITHDRAWAL_LOCKED"
  | "INTEREST_ALREADY_COORDINATING"
  | "INTEREST_RATE_LIMITED"
  | "COORDINATION_LIMIT_REACHED"
  | "ACTION_PLAN_PENDING"
  | "PEER_REPLY_REQUIRED"
  | "RESERVATION_EXPIRED"
  | "RESERVATION_INVALID"
  | "CURSOR_EXPIRED"
  | "CONTEXT_ENDED"
  | "CONTEXT_PLAN_PENDING"
  | "SAFETY_UNAVAILABLE"
  | "PLAN_TIME_INVALID"
  | "PLAN_TIME_PASSED"
  | "PLAN_NOT_CONFIRMED"
  | "PLAN_CHANGE_PENDING"
  | "PLAN_ALREADY_CANCELED"
  | "PLAN_SHARED_FIELD_REQUIRES_COORDINATION";

export type ActionCoordinationNonSafetyErrorCode = Exclude<
  ActionCoordinationErrorCode,
  "SAFETY_UNAVAILABLE"
>;

export type ActionCoordinationConflictCode = Exclude<
  ActionCoordinationErrorCode,
  | "CLIENT_CAPABILITY_REQUIRED"
  | "COORDINATION_POLICY_UNSUPPORTED"
  | "SAFETY_UNAVAILABLE"
>;

export class ActionCoordinationFailure extends Error {
  readonly name = "ActionCoordinationFailure";

  constructor(
    readonly code: ActionCoordinationNonSafetyErrorCode,
    message: string,
    readonly status: number,
    readonly retryable = false,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
  }
}

export class ActionCoordinationSafetyUnavailable extends Error {
  readonly name = "ActionCoordinationSafetyUnavailable";
  readonly code = "SAFETY_UNAVAILABLE" as const;
  readonly retryable = false as const;

  constructor(readonly status: 403 | 404 = 404) {
    super("The requested coordination is unavailable.");
    Object.freeze(this);
  }
}

export class ActionCoordinationConflict<
  TCurrentState extends ActionCoordinationJsonObject,
> extends Error {
  readonly name = "ActionCoordinationConflict";
  readonly status = 409 as const;
  readonly retryable = false as const;

  constructor(
    readonly code: ActionCoordinationConflictCode,
    message: string,
    readonly currentState: TCurrentState,
    readonly recovery: RouteRecoveryDTO,
  ) {
    super(message);
  }
}

export function isActionCoordinationFailure(
  cause: unknown,
): cause is ActionCoordinationFailure | ActionCoordinationSafetyUnavailable {
  return (
    cause instanceof ActionCoordinationFailure ||
    cause instanceof ActionCoordinationSafetyUnavailable
  );
}

export function isActionCoordinationConflict(
  cause: unknown,
): cause is ActionCoordinationConflict<
  ActionCoordinationJsonObject
> {
  return cause instanceof ActionCoordinationConflict;
}

/** The neutral public failure never contains Block or moderation details. */
export function safetyUnavailable(
  status: 403 | 404 = 404,
): ActionCoordinationSafetyUnavailable {
  return new ActionCoordinationSafetyUnavailable(status);
}
