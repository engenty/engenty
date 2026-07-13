import { defineManifest } from "@crxjs/vite-plugin";

/**
 * Web-app origins allowed to initiate the link handshake
 * (chrome.runtime.sendMessage from the page). Dev origins are hardcoded;
 * production origins come from ENGENTY_BRIDGE_ORIGINS (comma-separated match
 * patterns) at build time.
 */
const DEV_LINK_ORIGINS = [
  "https://engenty.localhost/*",
  "https://*.engenty.localhost/*",
];

const extraLinkOrigins = (process.env.ENGENTY_BRIDGE_ORIGINS ?? "")
  .split(",")
  .map((entry) => entry.trim())
  .filter((entry) => entry.length > 0);

export default defineManifest({
  manifest_version: 3,
  name: "engenty Browser Bridge",
  description:
    "Links a dedicated browser window to an engenty agent session: the agent navigates and observes, and acts only with your approval.",
  version: "0.0.1",
  action: {
    default_title: "engenty Browser Bridge",
  },
  background: {
    service_worker: "src/background/index.ts",
    type: "module",
  },
  side_panel: {
    default_path: "src/sidepanel/index.html",
  },
  permissions: [
    "storage",
    "tabs",
    "scripting",
    "sidePanel",
    "alarms",
    "webNavigation",
  ],
  // Deliberately empty: site access is granted per-origin (following the
  // navigation allowlist) via optional host permissions, so the install-time
  // prompt stays minimal.
  host_permissions: [],
  optional_host_permissions: ["http://*/*", "https://*/*"],
  externally_connectable: {
    matches: [...DEV_LINK_ORIGINS, ...extraLinkOrigins],
  },
});
