import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  mirrorSchoolVerificationToUser,
  userVerificationFieldsFromState,
} from "../../lib/verification/school-state";

describe("school-scoped verification state", () => {
  test("a school without a saved state resets the mirrored user identity", () => {
    assert.deepEqual(userVerificationFieldsFromState(null), {
      email: null,
      verifiedStudent: false,
      studentVerificationStatus: "UNVERIFIED",
      studentVerificationMethod: null,
      studentVerifiedAt: null,
      emailVerifiedAt: null,
      studentVerificationNotes: null,
      manualReviewProofUrl: null,
      manualReviewProofFilename: null,
      manualReviewRequestedAt: null,
    });
  });

  test("the selected school's saved identity is mirrored to the user", async () => {
    const verifiedAt = new Date("2026-08-07T08:00:00.000Z");
    const state = {
      email: "student@tum.de",
      verifiedStudent: true,
      studentVerificationStatus: "VERIFIED" as const,
      studentVerificationMethod: "SCHOOL_EMAIL" as const,
      studentVerifiedAt: verifiedAt,
      emailVerifiedAt: verifiedAt,
      studentVerificationNotes: null,
      manualReviewProofUrl: null,
      manualReviewProofFilename: null,
      manualReviewRequestedAt: null,
    };
    let updateCall: unknown;
    const tx = {
      userSchoolVerification: {
        findUnique: async (args: unknown) => {
          assert.deepEqual(args, {
            where: { userId_school: { userId: "user-1", school: "TUM" } },
          });
          return state;
        },
      },
      user: {
        update: async (args: unknown) => {
          updateCall = args;
        },
      },
    } as unknown as Parameters<typeof mirrorSchoolVerificationToUser>[0];

    await mirrorSchoolVerificationToUser(tx, "user-1", "TUM");

    assert.deepEqual(updateCall, {
      where: { id: "user-1" },
      data: {
        email: "student@tum.de",
        verifiedStudent: true,
        studentVerificationStatus: "VERIFIED",
        studentVerificationMethod: "SCHOOL_EMAIL",
        studentVerifiedAt: verifiedAt,
        emailVerifiedAt: verifiedAt,
        studentVerificationNotes: null,
        manualReviewProofUrl: null,
        manualReviewProofFilename: null,
        manualReviewRequestedAt: null,
      },
    });
  });
});
