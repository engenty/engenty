/**
 * Minimal service worker — enables PWA install prompt in Chrome.
 * Does not cache anything; Engenty is an authenticated SPA where offline
 * access is not meaningful. The fetch listener satisfies Chrome's
 * installability requirement.
 */

self.addEventListener("fetch", (_event) => {});
