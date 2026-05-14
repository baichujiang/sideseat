import { redirect } from "next/navigation";

export default function InboxPlansRedirectPage() {
  redirect("/profile/my-plan");
}
