import "server-only";

import type {
  DiscoverPostClientRow,
  DiscoverPostRawPolicyField,
  DiscoverPostRow,
} from "@/lib/discover/discover-post-row";
import {
  allowsLegacyDirectConversationForAction,
  type ActionPolicyTuple,
} from "@/lib/v2/action-coordination/policy-snapshot";

function splitRawActionPolicySnapshots<T extends ActionPolicyTuple>(row: T) {
  const {
    coordinationPolicy,
    policySchemaVersion,
    policyParametersSnapshot,
    experimentKeySnapshot,
    experimentVariantSnapshot,
    clientCapabilitySnapshot,
    policySnapshottedAt,
    ...publicRow
  } = row;

  return {
    publicRow: publicRow as Omit<T, DiscoverPostRawPolicyField>,
    policyTuple: {
      coordinationPolicy,
      policySchemaVersion,
      policyParametersSnapshot,
      experimentKeySnapshot,
      experimentVariantSnapshot,
      clientCapabilitySnapshot,
      policySnapshottedAt,
    } satisfies ActionPolicyTuple,
  };
}

/** Strip private immutable Action metadata from any legacy Web response. */
export function withoutRawActionPolicySnapshots<T extends ActionPolicyTuple>(
  row: T,
): Omit<T, DiscoverPostRawPolicyField> {
  return splitRawActionPolicySnapshots(row).publicRow;
}

/**
 * Collapse the immutable Action policy tuple into the only legacy Web-card
 * permission it needs. Keeping this projection server-only prevents policy,
 * experiment, and creator client-build snapshots from entering the RSC payload.
 */
export function toPublicDiscoverPostRow(
  row: DiscoverPostRow,
): DiscoverPostClientRow {
  const { publicRow, policyTuple } = splitRawActionPolicySnapshots(row);

  return {
    ...publicRow,
    allowsLegacyDirectConversation:
      allowsLegacyDirectConversationForAction(policyTuple),
  };
}
