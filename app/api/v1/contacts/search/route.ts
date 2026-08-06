import { requireV1User } from "@/lib/api/v1/auth";
import { searchContacts } from "@/lib/api/v1/contacts-service";
import { v1Success } from "@/lib/api/v1/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;
  const query = new URL(request.url).searchParams.get("q") ?? "";
  const hits = await searchContacts({ userId: auth.user.id, query });
  return v1Success({ hits }, { request });
}
