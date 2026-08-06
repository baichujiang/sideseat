import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createSignupSchema } from "../../lib/validators/auth";
import { profileSchema } from "../../lib/validators/profile";

const signupBase = {
  displayName: "Mina Chen",
  username: "Mina_01",
  password: "Password123",
  school: "TUM" as const,
  degreeLevel: "MASTER" as const,
};

describe("student identity validation", () => {
  it("requires a semester for current and exchange students", () => {
    const result = createSignupSchema().safeParse({
      ...signupBase,
      studentStatus: "CURRENT_STUDENT",
    });
    assert.equal(result.success, false);
    assert.equal(result.error?.issues[0]?.path[0], "semester");
  });

  it("requires graduation year for alumni and normalizes username", () => {
    const missingYear = createSignupSchema().safeParse({
      ...signupBase,
      studentStatus: "ALUMNI",
    });
    assert.equal(missingYear.success, false);
    assert.equal(missingYear.error?.issues[0]?.path[0], "graduationYear");

    const valid = createSignupSchema().parse({
      ...signupBase,
      studentStatus: "ALUMNI",
      graduationYear: new Date().getFullYear(),
    });
    assert.equal(valid.username, "mina_01");
  });

  it("keeps the full web profile form subject to the same alumni rule", () => {
    const result = profileSchema.safeParse({
      nickname: "Mina",
      gender: "PRIVATE",
      school: "TUM",
      studentStatus: "ALUMNI",
      degreeLevel: "MASTER",
      major: "Informatics",
      semester: 1,
      languages: [{ tag: "ENGLISH", proficiency: "FLUENT" }],
      discoverByCourse: true,
      discoverByMajor: true,
      discoverBySemester: true,
      allowInvitationNotes: true,
      contactInfoOptIn: false,
      hideFromCourseMembers: false,
      hideFromDiscovery: false,
      hideFromRecommendations: false,
    });
    assert.equal(result.success, false);
    assert.equal(result.error?.issues[0]?.path[0], "graduationYear");
  });
});
