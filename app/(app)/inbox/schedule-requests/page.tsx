import { redirect } from "next/navigation";

/** Schedule-share proposals now arrive as Plan requests in Chats. */
export default function InboxScheduleRequestsPage() {
  redirect("/inbox");
}
