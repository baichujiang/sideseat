import { requireOnboardedUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { error, ok, parseBody } from "@/lib/http";
import { pushSubscribeSchema, pushUnsubscribeSchema } from "@/lib/validators/push-subscription";

export async function POST(request: Request) {
  try {
    const user = await requireOnboardedUser();
    const raw = await request.json();
    const parsed = parseBody(raw, pushSubscribeSchema);
    if (!parsed.ok) {
      return error(parsed.error, 400);
    }
    const { endpoint, keys, userAgent } = parsed.data;

    await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: {
        userId: user.id,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent: userAgent ?? request.headers.get("user-agent")?.slice(0, 512) ?? null,
      },
      update: {
        userId: user.id,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent: userAgent ?? request.headers.get("user-agent")?.slice(0, 512) ?? null,
      },
    });

    return ok({ saved: true }, { status: 201 });
  } catch (cause) {
    console.error(cause);
    return error("Unable to save push subscription.");
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireOnboardedUser();
    const raw = await request.json();
    const parsed = parseBody(raw, pushUnsubscribeSchema);
    if (!parsed.ok) {
      return error(parsed.error, 400);
    }

    await prisma.pushSubscription.deleteMany({
      where: { userId: user.id, endpoint: parsed.data.endpoint },
    });

    return ok({ removed: true });
  } catch (cause) {
    console.error(cause);
    return error("Unable to remove push subscription.");
  }
}
