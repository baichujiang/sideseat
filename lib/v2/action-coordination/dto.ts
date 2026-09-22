/**
 * JSON values accepted by the B-light wire and idempotency boundary.
 *
 * Command callers must pass already-normalized JSON. In particular, undefined,
 * Date, bigint, NaN and Infinity are not wire values and are rejected by the
 * command identity builder rather than being silently reinterpreted.
 */
export type ActionCoordinationJsonPrimitive = string | number | boolean | null;
export type ActionCoordinationJsonValue =
  | ActionCoordinationJsonPrimitive
  | ActionCoordinationJsonValue[]
  | ActionCoordinationJsonObject;
export type ActionCoordinationJsonObject = {
  [key: string]: ActionCoordinationJsonValue;
};

export type ActionResponsesRouteFocus = {
  type: "ACTION_RESPONSES";
  actionId: string;
  interestId?: string;
};

export type InterestRouteFocus = {
  type: "INTEREST";
  interestId: string;
};

export type CoordinationShellRouteFocus = {
  type: "COORDINATION_SHELL";
  interestId: string;
  reservationId: string;
};

export type ActionContextRouteFocus = {
  type: "ACTION_CONTEXT";
  connectionId: string;
  contextId: string;
};

export type MessageRouteFocus = {
  type: "MESSAGE";
  connectionId: string;
  messageId: string;
};

export type PlanRouteFocus = {
  type: "PLAN";
  connectionId: string;
  commitmentId: string;
  revisionId?: string;
};

/**
 * Stable navigation identity for recovery. This deliberately is not a bag of
 * nullable IDs: each discriminator permits exactly the identifiers it needs.
 */
export type RouteFocusDTO =
  | ActionResponsesRouteFocus
  | InterestRouteFocus
  | CoordinationShellRouteFocus
  | ActionContextRouteFocus
  | MessageRouteFocus
  | PlanRouteFocus;

export type TypedRouteRecoveryDTO<
  TAction extends string,
  TFocus extends RouteFocusDTO,
> = {
  action: TAction;
  focus: TFocus;
};

/**
 * Only recovery action literals already frozen by the implementation contract
 * live here. API slices extend their own union when their OpenAPI fixture freezes
 * another action literal; BL-BE-04 must not guess those wire values.
 */
export type RouteRecoveryDTO =
  | TypedRouteRecoveryDTO<"OPEN_PLAN", PlanRouteFocus>
  | TypedRouteRecoveryDTO<"REACTIVATE_INTEREST", InterestRouteFocus>;

function requiredId(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${field} must be a non-empty identifier.`);
  }
  return value;
}

/** Rebuild a focus from its allowlisted fields; structural extras never cross the wire. */
export function exactRouteFocusDTO(focus: RouteFocusDTO): RouteFocusDTO {
  switch (focus.type) {
    case "ACTION_RESPONSES":
      return focus.interestId === undefined
        ? { type: "ACTION_RESPONSES", actionId: requiredId(focus.actionId, "actionId") }
        : {
            type: "ACTION_RESPONSES",
            actionId: requiredId(focus.actionId, "actionId"),
            interestId: requiredId(focus.interestId, "interestId"),
          };
    case "INTEREST":
      return {
        type: "INTEREST",
        interestId: requiredId(focus.interestId, "interestId"),
      };
    case "COORDINATION_SHELL":
      return {
        type: "COORDINATION_SHELL",
        interestId: requiredId(focus.interestId, "interestId"),
        reservationId: requiredId(focus.reservationId, "reservationId"),
      };
    case "ACTION_CONTEXT":
      return {
        type: "ACTION_CONTEXT",
        connectionId: requiredId(focus.connectionId, "connectionId"),
        contextId: requiredId(focus.contextId, "contextId"),
      };
    case "MESSAGE":
      return {
        type: "MESSAGE",
        connectionId: requiredId(focus.connectionId, "connectionId"),
        messageId: requiredId(focus.messageId, "messageId"),
      };
    case "PLAN":
      return focus.revisionId === undefined
        ? {
            type: "PLAN",
            connectionId: requiredId(focus.connectionId, "connectionId"),
            commitmentId: requiredId(focus.commitmentId, "commitmentId"),
          }
        : {
            type: "PLAN",
            connectionId: requiredId(focus.connectionId, "connectionId"),
            commitmentId: requiredId(focus.commitmentId, "commitmentId"),
            revisionId: requiredId(focus.revisionId, "revisionId"),
          };
  }
}

export function exactRouteRecoveryDTO(
  recovery: RouteRecoveryDTO,
): RouteRecoveryDTO {
  switch (recovery.action) {
    case "OPEN_PLAN": {
      if (recovery.focus.type !== "PLAN") {
        throw new TypeError("OPEN_PLAN recovery requires PLAN focus.");
      }
      return { action: "OPEN_PLAN", focus: exactRouteFocusDTO(recovery.focus) as PlanRouteFocus };
    }
    case "REACTIVATE_INTEREST": {
      if (recovery.focus.type !== "INTEREST") {
        throw new TypeError("REACTIVATE_INTEREST recovery requires INTEREST focus.");
      }
      return {
        action: "REACTIVATE_INTEREST",
        focus: exactRouteFocusDTO(recovery.focus) as InterestRouteFocus,
      };
    }
  }
}
