/** Parse the native contact-share text without following arbitrary external URLs. */
export function sharedPlanFromMessage(
  body: string | null,
  currentHost: string,
) {
  if (!body) return null;
  const candidate = body.match(
    /https?:\/\/[^\s]+\/time-polls\/[A-Za-z0-9_-]+/u,
  )?.[0];
  if (!candidate) return null;
  const url = new URL(candidate);
  if (
    ![
      "sideseat.de",
      "www.sideseat.de",
      "api.sideseat.de",
      currentHost,
    ].includes(url.host)
  )
    return null;
  const token = url.pathname.slice("/time-polls/".length);
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(token)) return null;
  return {
    token,
    title:
      body
        .split("\n")[0]
        .replace(/^📅\s*/u, "")
        .trim() || "朋友分享的计划",
  };
}
