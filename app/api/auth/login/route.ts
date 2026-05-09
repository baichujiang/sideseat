import { findUserForLogin } from "@/lib/auth/lookup-user";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { isDatabaseUnreachable, warnDatabaseUnreachableThrottled } from "@/lib/db/prisma-errors";
import { error, ok, parseBody } from "@/lib/http";
import { loginRequestSchema } from "@/lib/validators/auth";

export async function POST(request: Request) {
  try {
    const raw = await request.json();
    const parsed = parseBody(raw, loginRequestSchema);
    if (!parsed.ok) {
      return error(parsed.error, 422);
    }
    const values = parsed.data;

    const user = await findUserForLogin(values.identifier);

    if (!user || !(await verifyPassword(values.password, user.hashedPassword))) {
      return error("Invalid username/email or password.", 401);
    }

    const { accessToken, expiresIn } = await createSession(user.id);

    return ok({
      userId: user.id,
      onboardingComplete: user.onboardingComplete,
      accessToken,
      expiresIn,
    });
  } catch (cause) {
    if (isDatabaseUnreachable(cause)) {
      warnDatabaseUnreachableThrottled("POST /api/auth/login");
      return error(
        "Cannot connect to the database. Check DATABASE_URL and that your Neon project is awake.",
        503,
      );
    }
    console.error(cause);
    return error("Unable to log in.", 400);
  }
}
