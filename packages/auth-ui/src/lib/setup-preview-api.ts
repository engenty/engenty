/**
 * The wizard's preview backend: every call answers from memory after a short,
 * realistic pause. Nothing reaches core, Supabase or apps/ai, so the preview
 * page can run the whole flow as often as it likes.
 */
import { spaceKeyFromName } from "@engenty/ai-core/browser";
import type { SetupCheck } from "./initial-setup-checks";
import type { SetupCatalog } from "./initial-setup-workspace";
import type { ServerSetupApi } from "./setup-api";
import type { TenantSetupApi } from "./tenant-setup-api";

export interface PreviewScenario {
  /** The installation starts with a red row that clears after a few seconds. */
  brokenInstall: boolean;
  /** The server environment already has a gateway key: the AI step is skipped. */
  envKey: boolean;
}

export const DEFAULT_PREVIEW_SCENARIO: PreviewScenario = {
  brokenInstall: false,
  envKey: false,
};

/** How long the broken installation stays broken: two polls of the check. */
const BROKEN_FOR_MS = 9000;

const pause = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

function previewChecks(
  scenario: PreviewScenario,
  broken: boolean
): SetupCheck[] {
  return [
    { id: "database", label: "Database reachable", status: "ok" },
    { id: "mastra_schema", label: "Mastra schema applied", status: "ok" },
    broken
      ? {
          detail: "http://localhost:8790/ai/health — fetch failed",
          fix: "pnpm dev  (apps/ai must be running)",
          id: "ai_service",
          label: "AI service reachable from core",
          status: "fail",
        }
      : {
          id: "ai_service",
          label: "AI service reachable from core",
          status: "ok",
        },
    scenario.envKey
      ? {
          detail: "AI_GATEWAY_API_KEY set",
          id: "ai_provider",
          label: "AI provider key",
          status: "ok",
        }
      : {
          detail: "No gateway key in the server environment",
          id: "ai_provider",
          label: "AI provider key",
          status: "warn",
          step: 2,
        },
    {
      id: "server_lane",
      label: "Tenant lane accepted by the database",
      status: "ok",
    },
    {
      id: "baseline_modules",
      label: "Baseline modules installed",
      status: "ok",
    },
    {
      id: "ai_service_browser",
      label: "AI service reachable from this browser",
      status: "ok",
    },
  ];
}

/** Shaped like `GET /api/spaces/setup-catalog` on a full local install. */
const PREVIEW_CATALOG: SetupCatalog = {
  baseline: [
    {
      agentAccess: "none",
      resourceKey: "engenty-copilot",
      resourceType: "module",
    },
    { agentAccess: "write", resourceKey: "files", resourceType: "module" },
    {
      agentAccess: "write",
      resourceKey: "connections",
      resourceType: "module",
    },
    { resourceKey: "engenty.copilot", resourceType: "agent" },
  ],
  modules: [
    {
      description: null,
      id: "engenty-apps",
      name: "engenty Apps",
      requires: [],
    },
    { description: null, id: "tasks", name: "Tasks", requires: [] },
    { description: null, id: "contacts", name: "Contacts", requires: [] },
    {
      description: null,
      id: "knowledge-base",
      name: "Knowledge Base",
      requires: [],
    },
    { description: null, id: "offers", name: "Offers", requires: [] },
    {
      description: null,
      id: "invoices",
      name: "Invoices",
      requires: ["commercial-settings", "pdf-templates"],
    },
    { description: null, id: "expenses", name: "Expenses", requires: [] },
    {
      description: null,
      id: "commercial-settings",
      name: "Commercial Settings",
      requires: [],
    },
    {
      description: null,
      id: "pdf-templates",
      name: "PDF Templates",
      requires: [],
    },
  ],
  templates: [
    {
      description:
        "A client or engagement: offers, invoices, contacts and the projects that go with them.",
      featuredMountKeys: ["module:tasks", "module:projects", "module:contacts"],
      id: "client",
      name: "Client",
    },
    {
      description:
        "A team or department: ongoing work, shared knowledge, time.",
      featuredMountKeys: [
        "module:tasks",
        "module:projects",
        "module:knowledge-base",
      ],
      id: "team",
      name: "Team",
    },
    {
      description: "A subject kept under observation: sources, notes, memory.",
      featuredMountKeys: ["module:tasks", "module:knowledge-base"],
      id: "research",
      name: "Research",
    },
    {
      description: "A private work area: tasks, files and inbox.",
      featuredMountKeys: ["module:tasks", "module:inbox"],
      id: "personal",
      name: "Private work",
    },
    {
      description: "Chat and Files only. Add the apps this space needs.",
      featuredMountKeys: [],
      id: "blank",
      name: "Blank",
    },
  ],
};

export function createPreviewServerSetupApi(
  scenario: PreviewScenario
): ServerSetupApi {
  const brokenUntil = Date.now() + BROKEN_FOR_MS;
  return {
    createAdmin: () => pause(700),
    finish: () => pause(600),
    readChecks: async () => {
      await pause(700);
      return previewChecks(
        scenario,
        scenario.brokenInstall && Date.now() < brokenUntil
      );
    },
    saveProviderKey: async () => {
      await pause(600);
      return {
        reload: { hydrated: ["AI_GATEWAY_API_KEY"], status: "reloaded" },
      };
    },
    signIn: async () => {
      await pause(300);
      return { accessToken: "preview", userId: "preview-user" };
    },
    testProviderKey: async ({ apiKey }) => {
      await pause(800);
      return apiKey.length >= 12
        ? { detail: "Key accepted", modelCount: 212, status: "valid" }
        : {
            detail: "The gateway rejected this key",
            modelCount: null,
            status: "invalid",
          };
    },
  };
}

export function createPreviewTenantSetupApi(
  personName: string
): TenantSetupApi {
  return {
    addApps: () => pause(700),
    ensureFirstSpace: async ({ name }) => {
      await pause(600);
      return {
        id: "preview-space",
        key: spaceKeyFromName(name) || "space",
        name,
      };
    },
    hireEngenty: async ({ choice }) => {
      await pause(1100);
      return {
        id: spaceKeyFromName(choice.name) || "agent",
        name: choice.name,
      };
    },
    openCopilot: async () => {
      await pause(1400);
      return { created: true };
    },
    readCatalog: async () => {
      await pause(300);
      return PREVIEW_CATALOG;
    },
    saveCopilotLook: () => pause(300),
    finish: () => pause(300),
    saveWorkRules: () => pause(500),
    readContext: async () => {
      await pause(300);
      return {
        personName,
        tenant: { id: "preview-tenant", name: "Kaiser Design" },
        userId: "preview-user",
      };
    },
  };
}
