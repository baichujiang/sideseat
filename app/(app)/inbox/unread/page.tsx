import { redirect } from "next/navigation";

/** Legacy route — unread filter removed; keep redirect for old links. */
export default function InboxUnreadPage() {
  redirect("/inbox");
}
