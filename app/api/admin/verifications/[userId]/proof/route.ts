import { requireAdminUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { error } from "@/lib/http";
import { readVerificationProof } from "@/lib/media/verification-proof-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  await requireAdminUser();

  try {
    const { userId } = await params;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        manualReviewProofUrl: true,
        manualReviewProofFilename: true,
      },
    });

    if (!user?.manualReviewProofUrl) {
      return error("Verification document not found.", 404);
    }

    const result = await readVerificationProof(user.manualReviewProofUrl);
    if (!result || result.statusCode !== 200) {
      return error("Verification document not found.", 404);
    }

    const filename = user.manualReviewProofFilename || "verification-document";
    const asciiFilename = filename.replace(/[^\x20-\x7E]|["\\]/g, "_");
    const encodedFilename = encodeURIComponent(filename).replace(
      /['()*]/g,
      (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
    );

    return new Response(result.stream, {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "Content-Disposition":
          `inline; filename="${asciiFilename}"; filename*=UTF-8''${encodedFilename}`,
        "Content-Length": String(result.blob.size),
        "Content-Type": result.blob.contentType || "application/octet-stream",
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "SAMEORIGIN",
      },
    });
  } catch (cause) {
    console.error("[admin-verification-proof] failed to read blob", cause);
    return error("Unable to open verification document.", 500);
  }
}
