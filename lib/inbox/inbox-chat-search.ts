import { selfNotesDisplayTitle } from "@/lib/connections/self-notes-title";
import type { InboxMerged } from "@/lib/queries/inbox-merge";

function haystackForInboxItem(item: InboxMerged, userId: string): string {
  const parts: string[] = [];
  if (item.kind === "direct") {
    const c = item.connection;
    const isSelfNotes = c.userAId === c.userBId;
    const other = c.userAId === userId ? c.userB : c.userA;
    const myRemark = c.userAId === userId ? c.contactRemarkByA?.trim() : c.contactRemarkByB?.trim();
    const displayName = isSelfNotes
      ? selfNotesDisplayTitle(other, myRemark)
      : myRemark || other.nickname?.trim() || "Student";
    parts.push(
      displayName,
      other.nickname ?? "",
      other.username ?? "",
      c.originCourse?.name ?? "",
      c.invitation?.course?.name ?? "",
    );
    const last = c.messages[0];
    if (last?.body) parts.push(last.body);
    for (const p of c.planRequests ?? []) {
      if (p.receiverUserId === userId || p.proposerUserId === userId) parts.push(p.title);
    }
  } else {
    const { course, last } = item;
    parts.push(course.name, course.code ?? "", course.school, course.semesterLabel);
    if (last?.body) parts.push(last.body);
    if (last?.sender.nickname) parts.push(last.sender.nickname);
  }
  return parts.join(" ").toLowerCase();
}

export function inboxChatMatchesQuery(item: InboxMerged, userId: string, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return haystackForInboxItem(item, userId).includes(needle);
}
