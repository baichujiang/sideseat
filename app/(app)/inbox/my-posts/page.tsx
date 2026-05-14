import { redirect } from "next/navigation";

export default function InboxMyPostsRedirectPage() {
  redirect("/profile/my-posts");
}
