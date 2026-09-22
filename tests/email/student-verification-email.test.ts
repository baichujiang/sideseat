import assert from "node:assert/strict";
import test from "node:test";

import {
  buildStudentVerificationHtml,
  buildStudentVerificationText,
} from "../../lib/email/send-student-verification";

const email = "student@tum.de";
const verifyUrl = "https://sideseat.de/api/student-verification/verify?token=abc123";

test("student verification email includes an accessible plain-text alternative", () => {
  const text = buildStudentVerificationText({ email, verifyUrl });

  assert.match(text, /student@tum\.de/);
  assert.match(text, /https:\/\/sideseat\.de\/api\/student-verification\/verify/);
  assert.match(text, /expires in 48 hours/i);
});

test("student verification HTML contains one verification URL and escapes user content", () => {
  const html = buildStudentVerificationHtml({
    email: 'student+"unsafe"@tum.de',
    verifyUrl,
  });

  assert.equal(html.split(verifyUrl).length - 1, 1);
  assert.doesNotMatch(html, /student\+"unsafe"@tum\.de/);
  assert.match(html, /student\+&quot;unsafe&quot;@tum\.de/);
});
