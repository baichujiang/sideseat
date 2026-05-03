import { getVapidPublicKey } from "@/lib/push/vapid-env";
import { ok } from "@/lib/http";

export const dynamic = "force-dynamic";

export function GET() {
  return ok({ publicKey: getVapidPublicKey() });
}
