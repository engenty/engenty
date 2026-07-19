/**
 * Service worker: PWA installability + web-push display (notifications N2).
 * No caching — Engenty is an authenticated SPA where offline access is not
 * meaningful; the fetch listener only satisfies Chrome's installability
 * requirement. Push payloads are JSON {title, body, route, tag} produced by
 * apps/ai (see src/notifications/web-push.ts).
 */

self.addEventListener("fetch", (_event) => {});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_error) {
    payload = { body: event.data ? event.data.text() : "" };
  }
  const title = payload.title || "engenty";
  event.waitUntil(
    self.registration.showNotification(title, {
      badge: "/icon-192.png",
      body: payload.body || "",
      data: { route: payload.route || null },
      icon: "/icon-192.png",
      ...(payload.tag ? { tag: payload.tag } : {}),
    })
  );
});

// Click: focus an open Engenty tab (told to navigate via postMessage — the
// SPA listens in the push settings hook) or open a fresh window on the route.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const route = event.notification.data && event.notification.data.route;
  const target = route || "/";
  event.waitUntil(
    self.clients
      .matchAll({ includeUncontrolled: true, type: "window" })
      .then((clients) => {
        const existing = clients.find((client) => "focus" in client);
        if (existing) {
          existing.postMessage({ route: target, type: "engenty:navigate" });
          return existing.focus();
        }
        return self.clients.openWindow(target);
      })
  );
});
