import { randomBytes } from "crypto";

import { StudentVerificationStatus } from "@prisma/client";
import { put } from "@vercel/blob";

import { requireUser } from "@/lib/auth/session";
import { DEFAULT_SCHOOL } from "@/lib/constants/schools";
import { prisma } from "@/lib/db/prisma";
import { error, ok } from "@/lib/http";
import { mirrorSchoolVerificationToUser, upsertSchoolVerificationState } from "@/lib/verification/school-state";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
]);

export async function POST(request: Request) {
  try {
    const user = await requireUser();

    const formData = await request.formData();
    const file = formData.get("file");
    const emailRaw = formData.get("email");

    if (!(file instanceof File)) {
      return error("Attach your enrollment certificate (PDF or image).");
    }

    if (file.size === 0) {
      return error("The uploaded file is empty.");
    }

    if (file.size > MAX_BYTES) {
      return error("File is too large. Max 5 MB.");
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      return error("Use a PDF or image (JPG, PNG, WEBP, HEIC).");
    }

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      console.error("[manual-review] BLOB_READ_WRITE_TOKEN is not configured.");
      return error("File uploads are not configured on the server yet.", 500);
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

    // Use an unguessable token-only path: Vercel Blob currently exposes
    // `public` access, so we rely on the long random token as obscurity.
    const token = randomBytes(24).toString("hex");
    const ext = file.name.includes(".")
      ? file.name.split(".").pop()?.toLowerCase().slice(0, 6) || "bin"
      : "bin";
    const blobKey = `student-proofs/${token}.${ext}`;

    const blob = await put(blobKey, file, {
      access: "public",
      contentType: file.type,
      addRandomSuffix: false,
    });

    const school = user.school ?? DEFAULT_SCHOOL;
    await prisma.$transaction(async (tx) => {
      await upsertSchoolVerificationState(tx, user.id, school, {
        email: email || null,
        verifiedStudent: false,
        studentVerificationStatus: StudentVerificationStatus.MANUAL_REVIEW_REQUIRED,
        emailVerifiedAt: null,
        manualReviewProofUrl: blob.url,
        manualReviewProofFilename: file.name,
        manualReviewRequestedAt: new Date(),
        studentVerificationNotes:
          "Manual review requested — enrollment certificate uploaded.",
      });
      await mirrorSchoolVerificationToUser(tx, user.id, school);
    });

    return ok({
      status: StudentVerificationStatus.MANUAL_REVIEW_REQUIRED,
      message: "Thanks — our team will review your enrollment certificate shortly.",
    });
  } catch (cause) {
    console.error(cause);
    return error("Unable to submit manual review.");
  }
}
