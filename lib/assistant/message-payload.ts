export type AssistantActionLink = {
  label: string;
  href: string;
};

export type AssistantReplyPayload = {
  text: string;
  links: AssistantActionLink[];
};

const ACTIONS_OPEN = "[sideseat-actions]";
const ACTIONS_CLOSE = "[/sideseat-actions]";

export function serializeAssistantMessage(payload: AssistantReplyPayload): string {
  const parts = [payload.text.trim()];
  if (payload.links.length > 0) {
    parts.push("", ACTIONS_OPEN, JSON.stringify({ links: payload.links }), ACTIONS_CLOSE);
  }
  return parts.join("\n");
}

export function parseAssistantMessage(raw: string): AssistantReplyPayload {
  const openIdx = raw.indexOf(ACTIONS_OPEN);
  if (openIdx === -1) {
    return { text: raw.trim(), links: [] };
  }

  const text = raw.slice(0, openIdx).trim();
  const afterOpen = raw.slice(openIdx + ACTIONS_OPEN.length);
  const closeIdx = afterOpen.indexOf(ACTIONS_CLOSE);
  const jsonSlice = closeIdx === -1 ? afterOpen.trim() : afterOpen.slice(0, closeIdx).trim();

  let links: AssistantActionLink[] = [];
  try {
    const parsed = JSON.parse(jsonSlice) as { links?: AssistantActionLink[] };
    if (Array.isArray(parsed.links)) {
      links = parsed.links.filter(
        (l) => typeof l?.label === "string" && typeof l?.href === "string" && l.href.startsWith("/"),
      );
    }
  } catch {
    links = [];
  }

  return { text, links };
}
