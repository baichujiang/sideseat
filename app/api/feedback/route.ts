import type { ProductFeedbackTopic } from "@prisma/client";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { APP_NAME } from "@/lib/constants/app";
import { getFeedbackInboxEmail } from "@/lib/constants/support";
import { prisma } from "@/lib/db/prisma";
import { emailDeliveryConfigured } from "@/lib/email/resend";
import { sendProductFeedback } from "@/lib/email/send-product-feedback";
import { error, ok, parseBody } from "@/lib/http";

const bodySchema = z.object({
  topic: z.enum(["bug", "idea", "other"]).optional(),
  message: z.string().trim().min(10, "Please write at least 10 characters.").max(4000),
});

function topicFromBody(raw: string | undefined): ProductFeedbackTopic {
  switch (raw) {
    case "bug":
      return "BUG";
    case "idea":
      return "IDEA";
    default:
      return "OTHER";
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    if (user.isGuest) {
      return error("Please create a full account to send in-app feedback.", 403);
    }

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return error("Invalid JSON body.", 400);
    }

    const parsed = parseBody(raw, bodySchema);
    if (!parsed.ok) {
      return error(parsed.error, 400);
    }

    const topic = topicFromBody(parsed.data.topic);

    const row = await prisma.productFeedback.create({
      data: {
        userId: user.id,
        topic,
        message: parsed.data.message,
      },
      select: { id: true },
    });

    const inbox = getFeedbackInboxEmail();
    if (emailDeliveryConfigured() && inbox) {
      const result = await sendProductFeedback({
        to: inbox,
        userId: user.id,
        userEmail: user.email,
        nickname: user.nickname,
        topic: parsed.data.topic ?? "other",
        message: parsed.data.message,
      });
      if (result.sent) {
        await prisma.productFeedback.update({
          where: { id: row.id },
          data: {
            emailSentAt: new Date(),
            emailProviderId: result.id ?? null,
          },
        });
      }
    }

    return ok({ id: row.id });
  } catch (cause) {
    if (
      typeof cause === "object" &&
      cause !== null &&
      "digest" in cause &&
      typeof (cause as { digest?: unknown }).digest === "string" &&
      String((cause as { digest: string }).digest).startsWith("NEXT_REDIRECT")
    ) {
      throw cause;
    }
    console.error(cause);
    return error(`Could not submit feedback to ${APP_NAME}.`);
  }
}
