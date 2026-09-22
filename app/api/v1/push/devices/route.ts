import { requireV1User } from "@/lib/api/v1/auth";
import { parseV1Json, v1Success } from "@/lib/api/v1/http";
import { prisma } from "@/lib/db/prisma";
import { defaultApnsEnvironment } from "@/lib/push/apns-env";
import {
  nativePushRegisterSchema,
  nativePushUnregisterSchema,
} from "@/lib/validators/native-push-device";

export const dynamic = "force-dynamic";

/** Register an APNs device token for the authenticated native client. */
export async function POST(request: Request) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;

  const parsed = await parseV1Json(request, nativePushRegisterSchema);
  if (!parsed.ok) return parsed.response;

  const { token, platform, environment, userAgent } = parsed.data;
  const resolvedEnvironment = environment ?? defaultApnsEnvironment();
  await prisma.nativePushDevice.upsert({
    where: { token },
    create: {
      userId: auth.user.id,
      token,
      platform,
      environment: resolvedEnvironment,
      userAgent: userAgent ?? request.headers.get("user-agent")?.slice(0, 512) ?? null,
    },
    update: {
      userId: auth.user.id,
      platform,
      environment: resolvedEnvironment,
      userAgent: userAgent ?? request.headers.get("user-agent")?.slice(0, 512) ?? null,
    },
  });

  return v1Success({ saved: true }, { request, status: 201 });
}

/** Remove an APNs device token for the authenticated native client. */
export async function DELETE(request: Request) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;

  const parsed = await parseV1Json(request, nativePushUnregisterSchema);
  if (!parsed.ok) return parsed.response;

  await prisma.nativePushDevice.deleteMany({
    where: { userId: auth.user.id, token: parsed.data.token },
  });

  return v1Success({ removed: true }, { request });
}
