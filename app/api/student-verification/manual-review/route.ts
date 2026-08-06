import { randomBytes } from "crypto";

import { StudentVerificationStatus } from "@prisma/client";

import { requireUser } from "@/lib/auth/session";
import { DEFAULT_SCHOOL } from "@/lib/constants/schools";
import { prisma } from "@/lib/db/prisma";
import { error, ok } from "@/lib/http";
import { consumeV1RateLimit, rateLimitSubject } from "@/lib/api/v1/rate-limit";
import {
  deleteVerificationProof,
  isVerificationProofStorageConfigured,
  uploadVerificationProof,
} from "@/lib/media/verification-proof-storage";
import { mirrorSchoolVerificationToUser, upsertSchoolVerificationState } from "@/lib/verification/school-state";

const MAX_BYTES = 4 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
]);

async function hasAllowedFileSignature(file: File): Promise<boolean> {
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const startsWith = (...signature: number[]) =>
    signature.every((value, index) => bytes[index] === value);

  if (file.type === "application/pdf") return startsWith(0x25, 0x50, 0x44, 0x46);
  if (file.type === "image/jpeg") return startsWith(0xff, 0xd8, 0xff);
  if (file.type === "image/png") {
    return startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
  }
  if (file.type === "image/webp") {
    return startsWith(0x52, 0x49, 0x46, 0x46) &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  }
  if (file.type === "image/heic") {
    return String.fromCharCode(...bytes.slice(4, 8)) === "ftyp";
  }
  return false;
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const school = user.school ?? DEFAULT_SCHOOL;
    const existingState = await prisma.userSchoolVerification.findUnique({
      where: { userId_school: { userId: user.id, school } },
      select: {
        studentVerificationStatus: true,
        manualReviewProofUrl: true,
      },
    });

    if (
      existingState?.studentVerificationStatus ===
      StudentVerificationStatus.VERIFIED
    ) {
      return ok({
        status: StudentVerificationStatus.VERIFIED,
        message: "Your school identity is already verified.",
      });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const emailRaw = formData.get("email");

    if (!(file instanceof File)) {
      return error("Attach an enrollment or graduation document (PDF or image).");
    }

    if (file.size === 0) {
      return error("The uploaded file is empty.");
    }

    if (file.size > MAX_BYTES) {
      return error("File is too large. Max 4 MB.");
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      return error("Use a PDF or image (JPG, PNG, WEBP, HEIC).");
    }

    if (!(await hasAllowedFileSignature(file))) {
      return error("The file contents do not match the selected PDF or image format.");
    }

    if (!isVerificationProofStorageConfigured()) {
      console.error(
        "[manual-review] VERIFICATION_BLOB_READ_WRITE_TOKEN is not configured.",
      );
      return error("File uploads are not configured on the server yet.", 500);
    }

    const rateLimit = await consumeV1RateLimit({
      scope: "school-document-verification",
      subject: rateLimitSubject(user.id),
      limit: 5,
      windowMs: 60 * 60 * 1000,
    });
    if (!rateLimit.allowed) {
      return error("Too many document uploads. Try again in about an hour.", 429);
    }

    const email = typeof emailRaw === "string" ? emailRaw.trim().toLowerCase() : "";

    // Guard against accidentally linking an email that belongs to a different
    // account — consistent with the email verification path.
    if (email) {
      const owner = await prisma.user.findUnique({ where: { email } });
      if (owner && owner.id !== user.id) {
        return error("That email is already linked to another account.", 409);
      }
    }

    // Keep pathnames unguessable as defense in depth even though the store is private.
    const token = randomBytes(24).toString("hex");
    const ext = file.name.includes(".")
      ? file.name.split(".").pop()?.toLowerCase().slice(0, 6) || "bin"
      : "bin";
    const blobKey = `student-proofs/${user.id}/${token}.${ext}`;

    const blob = await uploadVerificationProof(blobKey, file);

    try {
      await prisma.$transaction(async (tx) => {
        await upsertSchoolVerificationState(tx, user.id, school, {
          email: email || null,
          verifiedStudent: false,
          studentVerificationStatus: StudentVerificationStatus.MANUAL_REVIEW_REQUIRED,
          studentVerificationMethod: null,
          studentVerifiedAt: null,
          emailVerifiedAt: null,
          manualReviewProofUrl: blob.url,
          manualReviewProofFilename: file.name,
          manualReviewRequestedAt: new Date(),
          studentVerificationNotes:
            "Manual review requested — school identity document uploaded.",
        });
        await mirrorSchoolVerificationToUser(tx, user.id, school);
      });
    } catch (cause) {
      await deleteVerificationProof(blob.url).catch((cleanupCause) => {
        console.error("[manual-review] failed to delete unlinked upload", cleanupCause);
      });
      throw cause;
    }

    if (
      existingState?.manualReviewProofUrl &&
      existingState.manualReviewProofUrl !== blob.url
    ) {
      await deleteVerificationProof(existingState.manualReviewProofUrl).catch((cause) => {
        console.error("[manual-review] failed to delete superseded proof", cause);
      });
    }

    return ok({
      status: StudentVerificationStatus.MANUAL_REVIEW_REQUIRED,
      message: "Thanks — our team will review your school identity document shortly.",
    });
  } catch (cause) {
    console.error(cause);
    return error("Unable to submit manual review.");
  }
}
