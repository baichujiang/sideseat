import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { deriveNativeMVPReadiness } from "../../lib/api/v1/mvp-readiness";

describe("native MVP readiness", () => {
  it("requires real coordination languages rather than app locale", () => {
    const readiness = deriveNativeMVPReadiness({
        isGuest: false, onboardingComplete: true,
      school: "TUM",
      studentStatus: "CURRENT_STUDENT",
      verifiedStudent: true,
      studentVerificationStatus: "VERIFIED",
      languageCount: 0,
    });

    assert.deepEqual(readiness, {
      canUseApp: true,
      campusIdentityComplete: true,
      languagesComplete: false,
      verificationState: "VERIFIED",
      ready: false,
    });
  });

  it("is ready only when campus identity, languages, and verification are complete", () => {
    assert.deepEqual(
      deriveNativeMVPReadiness({
        isGuest: false, onboardingComplete: true,
        school: "LMU",
        studentStatus: "EXCHANGE_STUDENT",
        verifiedStudent: true,
        studentVerificationStatus: "VERIFIED",
        languageCount: 2,
      }),
      {
        canUseApp: true,
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
        isGuest: false, onboardingComplete: true,
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
        isGuest: false, onboardingComplete: true,
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

it("allows an upgraded guest into existing conversations without campus verification", () => {
  const input = { isGuest: false, onboardingComplete: true, school: null, studentStatus: null, verifiedStudent: false, studentVerificationStatus: "UNVERIFIED", languageCount: 0 };
  assert.equal(deriveNativeMVPReadiness(input).canUseApp, true);
  assert.equal(deriveNativeMVPReadiness(input).ready, false);
  assert.equal(deriveNativeMVPReadiness({...input, isGuest: true}).canUseApp, false);
  assert.equal(deriveNativeMVPReadiness({...input, onboardingComplete: false}).canUseApp, false);
});
