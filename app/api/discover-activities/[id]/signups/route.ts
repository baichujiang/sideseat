import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import {
  discoverActivityErrorMessage,
  discoverActivityErrorStatus,
} from "@/lib/discover/discover-activity-api-messages";
import {
  DiscoverActivitySignupError,
  setDiscoverActivitySignup,
} from "@/lib/discover/discover-activity-signup-service";
import { error, ok } from "@/lib/http";

async function requireUser() {
  const user = await getSessionUser();
  if (!user) return { ok: false as const, response: error("Sign in to continue.", 401, "AUTH_REQUIRED") };
  if (user.isGuest || !user.onboardingComplete) {
    return {
      ok: false as const,
      response: error("Complete your profile to continue.", 403, "ONBOARDING_REQUIRED"),
    };
  }
  return { ok: true as const, user };
}

function signupError(cause: DiscoverActivitySignupError) {
  if (cause.code === "NOT_FOUND") return error("Activity not found.", 404);
  return error(
    discoverActivityErrorMessage(cause.code),
    discoverActivityErrorStatus(cause.code),
    cause.code,
  );
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  try {
    const result = await prisma.$transaction((tx) =>
      setDiscoverActivitySignup(auth.user, id, true, tx),
    );
    return ok({ activity: result.activity }, { status: result.changed ? 201 : 200 });
  } catch (cause) {
    if (cause instanceof DiscoverActivitySignupError) return signupError(cause);
    console.error("POST signups", cause);
    return error("Unable to sign up.", 500);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  try {
    const result = await prisma.$transaction((tx) =>
      setDiscoverActivitySignup(auth.user, id, false, tx),
    );
    if (!result.changed) return new Response(null, { status: 204 });
    return ok({ activity: result.activity });
  } catch (cause) {
    if (cause instanceof DiscoverActivitySignupError) return signupError(cause);
    console.error("DELETE signups", cause);
    return error("Unable to cancel sign-up.", 500);
  }
}
