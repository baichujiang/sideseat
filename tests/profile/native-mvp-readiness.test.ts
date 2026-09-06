import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { deriveNativeMVPReadiness } from "../../lib/api/v1/mvp-readiness";

describe("native MVP readiness", () => {
  it("requires real coordination languages rather than app locale", () => {
    const readiness = deriveNativeMVPReadiness({
      school: "TUM",
      studentStatus: "CURRENT_STUDENT",
      verifiedStudent: true,
      studentVerificationStatus: "VERIFIED",
      languageCount: 0,
    });

    assert.deepEqual(readiness, {
      campusIdentityComplete: true,
      languagesComplete: false,
      verificationState: "VERIFIED",
      ready: false,
    });
  });

  it("is ready only when campus identity, languages, and verification are complete", () => {
    assert.deepEqual(
      deriveNativeMVPReadiness({
        school: "LMU",
        studentStatus: "EXCHANGE_STUDENT",
        verifiedStudent: true,
        studentVerificationStatus: "VERIFIED",
        languageCount: 2,
      }),
      {
        campusIdentityComplete: true,
        languagesComplete: true,
        verificationState: "VERIFIED",
        ready: true,
      },
    );
  });

  it("keeps pending and rejected verification out of the ready state", () => {
    for (const verificationState of [
      "EMAIL_PENDING",
      "MANUAL_REVIEW_REQUIRED",
      "REJECTED",
      "UNVERIFIED",
    ]) {
      const readiness = deriveNativeMVPReadiness({
        school: "TUM",
        studentStatus: "CURRENT_STUDENT",
        verifiedStudent: false,
        studentVerificationStatus: verificationState,
        languageCount: 1,
      });
      assert.equal(readiness.ready, false);
      assert.equal(readiness.verificationState, verificationState);
    }
  });

  it("requires a supported campus identity", () => {
    assert.equal(
      deriveNativeMVPReadiness({
        school: null,
        studentStatus: "CURRENT_STUDENT",
        verifiedStudent: true,
        studentVerificationStatus: "VERIFIED",
        languageCount: 1,
      }).campusIdentityComplete,
      false,
    );
  });
});
