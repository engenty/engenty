/**
 * First-party + highlighted stack credits shown above the full OSS list.
 * Keep homepage URLs public (GitHub / project sites).
 */

export interface ProductCredit {
  description: string;
  homepage: string;
  license?: string;
  name: string;
}

/** Engenty product + public repo. */
export const ENGENTY_CREDITS: ProductCredit[] = [
  {
    name: "engenty",
    description: "Open-core platform for people and agents as one team.",
    homepage: "https://github.com/engenty/engenty",
    license: "FSL-1.1-MIT",
  },
];

/** Major open-source building blocks called out in the README / stack. */
export const HIGHLIGHT_CREDITS: ProductCredit[] = [
  {
    name: "Mastra",
    description: "Agent framework powering apps/ai.",
    homepage: "https://github.com/mastra-ai/mastra",
    license: "Apache-2.0",
  },
  {
    name: "AG-UI",
    description: "Agent–user interaction protocol for the UI shell.",
    homepage: "https://github.com/ag-ui-protocol/ag-ui",
    license: "MIT",
  },
  {
    name: "Supabase",
    description: "Postgres, Auth, and storage on your infrastructure.",
    homepage: "https://github.com/supabase/supabase",
    license: "Apache-2.0",
  },
  {
    name: "Hono",
    description: "HTTP API and plugin host (apps/core).",
    homepage: "https://github.com/honojs/hono",
    license: "MIT",
  },
  {
    name: "React",
    description: "UI library for apps/ui.",
    homepage: "https://github.com/facebook/react",
    license: "MIT",
  },
  {
    name: "Vite",
    description: "Frontend toolchain for apps/ui.",
    homepage: "https://github.com/vitejs/vite",
    license: "MIT",
  },
  {
    name: "TanStack Query",
    description: "Async state and server-cache for the UI.",
    homepage: "https://github.com/TanStack/query",
    license: "MIT",
  },
  {
    name: "i18next",
    description: "Internationalization (en/de) across apps and modules.",
    homepage: "https://github.com/i18next/i18next",
    license: "MIT",
  },
  {
    name: "Tailwind CSS",
    description: "Utility-first styling for the product UI.",
    homepage: "https://github.com/tailwindlabs/tailwindcss",
    license: "MIT",
  },
  {
    name: "Base UI",
    description: "Accessible primitives underlying @engenty/ui-core.",
    homepage: "https://github.com/mui/base-ui",
    license: "MIT",
  },
  {
    name: "Lucide",
    description: "Icon set used across the shell and modules.",
    homepage: "https://github.com/lucide-icons/lucide",
    license: "ISC",
  },
  {
    name: "git-cliff",
    description: "Conventional Commits → changelog generation.",
    homepage: "https://github.com/orhun/git-cliff",
    license: "Apache-2.0 / MIT",
  },
];
