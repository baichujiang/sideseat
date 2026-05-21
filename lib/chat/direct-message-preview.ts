/**
 * Short text for reply strips, copy, and push previews for 1:1 messages.
 */
export function directMessageActionSnippet(message: {
  type: string;
  body: string;
  locationName: string | null;
}): string {
  if (message.type === "IMAGE") {
    return message.body.trim() || "Photo";
  }
  if (message.type === "LOCATION") {
    return (
      message.body.trim() ||
      message.locationName?.trim() ||
      "Location"
    );
  }
  if (message.type === "SCHEDULE_SHARE_CARD") {
    return message.body.trim() || "Shared schedule";
  }
  return message.body;
}
