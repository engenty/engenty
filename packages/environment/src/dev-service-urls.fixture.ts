/** Canonical Portless dev URLs for tests (gateway on engenty.localhost; see portless.json). */
export const ENGENTY_DEV_SERVICE_URLS_FIXTURE = {
  ui: "https://engenty.localhost",
  api: "https://engenty.localhost",
  ai: "https://ai.engenty.localhost",
  docs: "https://engenty.localhost",
  corsOrigins:
    "https://engenty.localhost,https://ai.engenty.localhost,http://localhost:3002,http://localhost:43111,http://127.0.0.1:43111",
} as const;
