import { redirect } from "next/navigation";

/** Always enter the app shell at Home — guests see the real tabs + sign-in prompts. */
export default async function RootPage() {
  redirect("/home");
}
