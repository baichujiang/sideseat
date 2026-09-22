import assert from "node:assert/strict";
import test from "node:test";

import { prepareInboxListMerged } from "@/lib/inbox/inbox-list-version";
import type { InboxMerged } from "@/lib/queries/inbox-merge";

function direct(userA: string, userB: string): InboxMerged {
  return {
    kind: "direct",
    connection: {
      userA: { username: userA },
      userB: { username: userB },
    },
  } as unknown as InboxMerged;
}

test("retired assistant conversations are removed from inbox preparation", () => {
  const regular = direct("student_a", "student_b");
  const retired = direct("student_a", "sideseat_assistant");
  const course = { kind: "course" } as InboxMerged;

  assert.deepEqual(prepareInboxListMerged([regular, retired, course]), [regular, course]);
});
