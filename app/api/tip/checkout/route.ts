import Stripe from "stripe";
import { z } from "zod";

import { APP_NAME } from "@/lib/constants/app";
import { requireUser } from "@/lib/auth/session";
import { error, ok, parseBody } from "@/lib/http";
import { requestAppOrigin } from "@/lib/http/request-app-origin";

const bodySchema = z.object({
  amountEur: z.coerce.number().min(0.5).max(200),
});

function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) return null;
  return new Stripe(key);
}

export async function POST(request: Request) {
  try {
    const stripe = getStripe();
    if (!stripe) {
      return error("Card tips are not enabled on this server.", 503);
    }

    const user = await requireUser();
    if (user.isGuest) {
      return error("Tips require a full account.", 403);
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

    const amountEur = parsed.data.amountEur;
    const unitAmount = Math.round(amountEur * 100);
    if (unitAmount < 50 || unitAmount > 20_000) {
      return error("Amount must be between €0.50 and €200.", 400);
    }

    const origin = requestAppOrigin(request);
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: user.email?.trim() || undefined,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "eur",
            unit_amount: unitAmount,
            product_data: {
              name: `${APP_NAME} — thank you`,
              description: "Voluntary tip (no goods or services).",
            },
          },
        },
      ],
      success_url: `${origin}/profile?tip=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/profile?tip=cancel`,
      metadata: {
        kind: "voluntary_tip",
        userId: user.id,
        amountEur: String(amountEur),
      },
    });

    if (!session.url) {
      return error("Could not start checkout.", 500);
    }

    return ok({ url: session.url });
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
    return error("Could not start payment. Try again later.");
  }
}
