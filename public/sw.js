/* SideSeat — PWA shell + push; updates wait for user “Update now” before skipWaiting.
 * API / navigations / RSC fetches bypass HTTP cache so old SW + disk cache don’t pin stale data. */

self.addEventListener("install", () => {
  /* Intentionally no skipWaiting — client posts SKIP_WAITING after user confirms. */
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    void self.skipWaiting();
  }
});

function shouldBypassHttpCache(request) {
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  if (request.method !== "GET" && request.method !== "HEAD") return true;
  if (url.pathname.startsWith("/api/")) return true;
  if (request.mode === "navigate") return true;
  if (request.headers.get("RSC") === "1") return true;
  if (request.headers.get("Next-Router-Prefetch")) return true;
  return false;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const opts = shouldBypassHttpCache(request) ? { cache: "no-store" } : {};
  event.respondWith(fetch(request, opts));
});

self.addEventListener("push", (event) => {
  let payload = { title: "SideSeat", body: "", url: "/home" };
  try {
    const text = event.data?.text();
    if (text) {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === "object") {
        payload = {
          title: typeof parsed.title === "string" ? parsed.title : payload.title,
          body: typeof parsed.body === "string" ? parsed.body : "",
          url: typeof parsed.url === "string" ? parsed.url : "/home",
        };
      }
    }
  } catch {
    /* ignore malformed payload */
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body || "Open SideSeat",
      data: { url: payload.url },
      icon: "/icons/192",
      badge: "/icons/192",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const rawUrl =
    typeof event.notification?.data?.url === "string" ? event.notification.data.url : "/home";
  const targetHref = new URL(rawUrl, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      function sameDocument(clientUrl, wantedHref) {
        try {
          const a = new URL(clientUrl);
          const b = new URL(wantedHref);
          return a.pathname === b.pathname && a.search === b.search;
        } catch {
          return false;
        }
      }

      function navigateExisting(client) {
        if (sameDocument(client.url, targetHref)) {
          return client.focus();
        }
        if ("navigate" in client && typeof client.navigate === "function") {
          return client
            .navigate(targetHref)
            .then(() => client.focus())
            .catch(() => {
              client.postMessage({ type: "NOTIFICATION_NAVIGATE", url: rawUrl });
              return client.focus();
            });
        }
        client.postMessage({ type: "NOTIFICATION_NAVIGATE", url: rawUrl });
        return client.focus();
      }

      for (const client of clientList) {
        if (!client.url.startsWith(self.location.origin)) continue;
        return navigateExisting(client);
      }

      return self.clients.openWindow ? self.clients.openWindow(targetHref) : undefined;
    }),
  );
});
