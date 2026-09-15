import type { FrontendToolDefinition } from "@engenty/ag-ui-bridge";
import { getCopilotBaseFrontendTools } from "@engenty/engenty-copilot/ai/frontend-tools";

/**
 * Server-side catalog for `@engenty/ai`, merged with AG-UI run `tools` carrying
 * `metadata.engenty`. The merged list is registered per run as native frontend
 * tools (see native-frontend-tool.ts) and named in the run instructions.
 */
export function getServerFrontendToolCatalog(): FrontendToolDefinition[] {
  return getCopilotBaseFrontendTools();
}

export function mergeFrontendToolDefinitions(
  clientTools: FrontendToolDefinition[] | undefined,
  options?: { includeServerTools?: boolean }
): FrontendToolDefinition[] {
  const byName = new Map<string, FrontendToolDefinition>();
  if (options?.includeServerTools !== false) {
    for (const def of getServerFrontendToolCatalog()) {
      byName.set(def.name, def);
    }
  }
  for (const def of clientTools ?? []) {
    byName.set(def.name, def);
  }
  return [...byName.values()];
}

export type FrontendToolTier = "chatbot" | "copilot" | "worker";

/** The agents that drive the product shell on the user's behalf. */
const COPILOT_LANE_AGENT_IDS: ReadonlySet<string> = new Set([
  "engenty.copilot",
  "engenty.cli",
]);

/**
 * The copilot's OWN chrome — opening, closing and re-docking its panel, the
 * shell theme and locale. An Engenty on its desk has no copilot panel to move
 * and no business changing the person's theme; it gets the page-driving set
 * (navigate, dialogs, focus, guided tour, browser-use) and nothing about the
 * shell itself.
 */
const COPILOT_CHROME_FRONTEND_TOOLS: ReadonlySet<string> = new Set([
  "openCopilot",
  "closeCopilot",
  "setCopilotDockMode",
  "shell_set_theme",
  "i18n_set_locale",
]);

/**
 * Whether one Engenty may hold the page-driving tools on THIS run.
 *
 * `uiTools` is the row's flag; `coordinator` is its position in the run's
 * Space (top-level: no `reports_to`). `auto` — the default — says the
 * coordinator drives the screen and the rest of the team does not, which is
 * what "the Space's own mouth and hands" means without a new privilege class.
 */
export interface FrontendToolGrant {
  coordinator: boolean;
  uiTools?: "auto" | "off" | "on" | null;
}

export function engentyHoldsFrontendTools(grant: FrontendToolGrant): boolean {
  switch (grant.uiTools ?? "auto") {
    case "on":
      return true;
    case "off":
      return false;
    default:
      return grant.coordinator;
  }
}

/**
 * Which frontend tools an agent may hold.
 *
 * A frontend tool mutates client-local state the server cannot reach —
 * navigation, focus, dialogs, theme, the copilot's own chrome, driving the page.
 * That is the copilot's job description and nobody else's. Presentation is NOT
 * client-local state and does not belong here: `show_artifact` and
 * `show_objects` are ordinary backend tools whose results each surface renders.
 *
 * The distinction is load-bearing rather than tidy. A frontend tool suspends the
 * run until a client resumes it, so an agent that holds one on a surface which
 * cannot resume — a background task job, a messaging channel — parks forever the
 * first time a model reaches for it (remote-channels.ts:738 has the Slack
 * post-mortem). Specialists are meant to run unattended, so they get none.
 */
export function resolveFrontendToolTier(
  agentId: string | undefined
): FrontendToolTier {
  if (agentId?.startsWith("chatbot")) {
    return "chatbot";
  }
  if (agentId && COPILOT_LANE_AGENT_IDS.has(agentId)) {
    return "copilot";
  }
  return "worker";
}

/**
 * The frontend tools to register for one run. The single seam — the executor,
 * its resume leg, the session service and the prompt block all call this, so
 * what the model is told it has cannot drift from what it actually has.
 *
 * `clientTools` is undefined when the caller sent neither `tools` nor a state
 * snapshot (see buildAppsAiRunContext). That is a caller with no browser —
 * a script, a bot, a channel bridge — so it gets nothing rather than a catalog
 * of tools nobody can execute.
 *
 * `grant` is the worker lane's exception: an Engenty whose row (or position
 * as coordinator) lets it drive the screen holds the page tools on a run a
 * browser started. The no-browser rule above still comes first — the grant
 * never reaches a routine or a channel turn, because those send no
 * `clientTools` to begin with.
 */
export function resolveFrontendToolsForAgent(params: {
  agentId: string | undefined;
  clientTools: FrontendToolDefinition[] | undefined;
  grant?: FrontendToolGrant | null;
}): FrontendToolDefinition[] {
  if (!params.clientTools) {
    return [];
  }
  switch (resolveFrontendToolTier(params.agentId)) {
    case "copilot":
      return mergeFrontendToolDefinitions(params.clientTools);
    // The embedded chatbot registers its own tools and never gets the shell's.
    case "chatbot":
      return mergeFrontendToolDefinitions(params.clientTools, {
        includeServerTools: false,
      });
    default:
      return params.grant && engentyHoldsFrontendTools(params.grant)
        ? mergeFrontendToolDefinitions(params.clientTools).filter(
            (tool) => !COPILOT_CHROME_FRONTEND_TOOLS.has(tool.name)
          )
        : [];
  }
}
