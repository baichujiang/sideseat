import { requireOnboardedUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { error, ok, parseBody } from "@/lib/http";
import { defaultApnsEnvironment } from "@/lib/push/apns-env";
import {
  nativePushRegisterSchema,
  nativePushUnregisterSchema,
} from "@/lib/validators/native-push-device";

/** Registers an APNs/FCM device token from the Capacitor shell. */
export async function POST(request: Request) {
  try {
    const user = await requireOnboardedUser();
    const raw = await request.json();
    const parsed = parseBody(raw, nativePushRegisterSchema);
    if (!parsed.ok) {
      return error(parsed.error, 400);
    }
    const { token, platform, environment, userAgent } = parsed.data;
    const resolvedEnvironment = environment ?? defaultApnsEnvironment();

    await prisma.nativePushDevice.upsert({
      where: { token },
      create: {
        userId: user.id,
        token,
        platform,
        environment: resolvedEnvironment,
        userAgent: userAgent ?? request.headers.get("user-agent")?.slice(0, 512) ?? null,
      },
      update: {
        userId: user.id,
        platform,
        environment: resolvedEnvironment,
        userAgent: userAgent ?? request.headers.get("user-agent")?.slice(0, 512) ?? null,
      },
    });

    return ok({ saved: true }, { status: 201 });
  } catch (cause) {
    console.error(cause);
    return error("Unable to save native push device.");
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireOnboardedUser();
    const raw = await request.json();
    const parsed = parseBody(raw, nativePushUnregisterSchema);
    if (!parsed.ok) {
      return error(parsed.error, 400);
    }

    await prisma.nativePushDevice.deleteMany({
      where: { userId: user.id, token: parsed.data.token },
    });

    return ok({ removed: true });
  } catch (cause) {
    console.error(cause);
    return error("Unable to remove native push device.");
  }
}
