import type {
  ActionCoordinationJsonObject,
  RouteRecoveryDTO,
} from "./dto";
import { exactRouteRecoveryDTO } from "./dto";
import {
  ActionCoordinationConflict,
  ActionCoordinationFailure,
  ActionCoordinationSafetyUnavailable,
  type ActionCoordinationErrorCode,
} from "./errors";

export type ActionCoordinationConflictPayload<
  TCurrentState extends ActionCoordinationJsonObject,
> = {
  error: {
    code: ActionCoordinationErrorCode;
    message: string;
    retryable: false;
  };
  currentState: TCurrentState;
  recovery: RouteRecoveryDTO;
};

export type ActionCoordinationFailurePayload = {
  error: {
    code: ActionCoordinationErrorCode;
    message: string;
    retryable: boolean;
    retryAfterSeconds?: number;
  };
};

export type ActionCoordinationExpectedFailurePayload =
  | ActionCoordinationConflictPayload<ActionCoordinationJsonObject>
  | ActionCoordinationFailurePayload;

export function actionCoordinationRetryAfterSeconds(
  body: unknown,
): number | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const error = (body as { error?: unknown }).error;
  if (!error || typeof error !== "object" || Array.isArray(error)) return null;
  const value = (error as { retryAfterSeconds?: unknown }).retryAfterSeconds;
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : null;
}

/**
 * Internal route result. Each OpenAPI-first slice may wrap/add request metadata,
 * but cannot lose the authoritative state or replace typed focus with nullable IDs.
 */
export function actionCoordinationConflictResult<
  TCurrentState extends ActionCoordinationJsonObject,
>(
  conflict: ActionCoordinationConflict<TCurrentState>,
): {
  status: 409;
  body: ActionCoordinationConflictPayload<TCurrentState>;
} {
  return {
    status: 409,
    body: {
      error: {
        code: conflict.code,
        message: conflict.message,
        retryable: false,
      },
      currentState: conflict.currentState,
      recovery: exactRouteRecoveryDTO(conflict.recovery),
    },
  };
}

export function actionCoordinationFailureResult(
  failure: ActionCoordinationFailure | ActionCoordinationSafetyUnavailable,
): {
  status: number;
  body: ActionCoordinationFailurePayload;
} {
  if (failure instanceof ActionCoordinationSafetyUnavailable) {
    return {
      status: failure.status === 403 ? 403 : 404,
      body: {
        error: {
          code: "SAFETY_UNAVAILABLE",
          message: "The requested coordination is unavailable.",
          retryable: false,
        },
      },
    };
  }
  return {
    status: failure.status,
    body: {
      error: {
        code: failure.code,
        message: failure.message,
        retryable: failure.retryable,
        ...(failure.retryAfterSeconds === undefined
          ? {}
          : { retryAfterSeconds: failure.retryAfterSeconds }),
      },
    },
  };
}
