import { requireOnboardedUser } from "@/lib/auth/guards";
import { ok } from "@/lib/http";
import { getDiscoverPeople } from "@/lib/queries/discovery";

export async function GET() {
  const user = await requireOnboardedUser();
  const people = await getDiscoverPeople(user.id);
  return ok(people);
}
