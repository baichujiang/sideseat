/* SideSeat — minimal service worker for PWA install + offline shell hints.
 * Pass-through fetch keeps installability without aggressive caching. */
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
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
  const url = event.notification?.data?.url || "/home";
  const target = new URL(url, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (!client.url.startsWith(self.location.origin) || !("focus" in client)) continue;
        if ("navigate" in client && typeof client.navigate === "function") {
          return client.navigate(target).then(() => client.focus());
        }
        return client.focus();
      }
      return self.clients.openWindow ? self.clients.openWindow(target) : undefined;
    }),
  );
});
