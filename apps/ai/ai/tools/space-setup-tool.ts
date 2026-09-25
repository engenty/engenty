// space_setup: what this Space has, and adding an app to it.
//
// Accounts are not added here: a connection belongs to the Space it was
// connected in (PLAN-space-owned-connections.md), so "ich brauche meine E-Mails
// hier" is the app plus a connect inside this Space
// (connections_request_connect). `list` shows both, so the model can tell
// which half is missing.
//
// "Mount = grant" (PLAN-spaces.md Phase 3), so this is the same write the Space
// setup dialog performs, from the same principal: it rides the run's own bearer
// and core refuses whoever the dialog would refuse. There is no second
// authorization path here and there must never be one.
//
// ONE tool with an `action` discriminator, for the reason `vault_files` gives:
// every attached schema rides in every model call, and Space setup is a
// capability most turns never touch.

import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import {
  EngentyCoreClient,
  EngentyCoreHttpError,
  getEngentyCoreBaseUrlFromEnv,
} from "../../src/ai/core-http-client.js";
import { invalidateRunSpaceSurface } from "../../src/ai/sessions/run-space.js";
import { getEngentyToolsRunContext } from "./engenty-tools/lib/run-context.js";
import { isUnresolvedSpaceGate } from "./engenty-tools/lib/space-gate.js";

export const SPACE_SETUP_TOOL_ID = "space_setup";

/** The connectors catalog, as much of it as this tool reads. */
interface ConnectorsCatalog {
  connectors?: Array<{
    capabilities?: { files?: boolean; storage?: boolean; stream?: boolean };
    connections?: Array<{
      display_name?: string | null;
      external_account?: string | null;
      id: string;
      status?: string;
    }>;
    id: string;
    name?: string;
  }>;
}

export interface SpaceSetupToolDeps {
  coreClientFor?: (input: {
    accessToken: string;
    coreBaseUrl: string;
  }) => EngentyCoreClient;
}

function defaultCoreClient(input: {
  accessToken: string;
  coreBaseUrl: string;
}): EngentyCoreClient {
  return new EngentyCoreClient(input);
}

/**
 * The Space this call writes to, or the reason there is none.
 *
 * A run with no Space is intentionally tenant-wide chat — there is nothing to
 * set up, and picking a Space for the user would be inventing one. An
 * unresolved Space is a refusal, never a widening.
 */
function resolveTarget():
  | { code: string; message: string; ok: false }
  | { accessToken: string; coreBaseUrl: string; ok: true; spaceId: string } {
  const ctx = getEngentyToolsRunContext();
  if (isUnresolvedSpaceGate(ctx.space)) {
    return {
      code: "space_context_unresolved",
      message:
        `This run claimed a Space (${ctx.space.reason}) but could not resolve it, so ${SPACE_SETUP_TOOL_ID} cannot read or change its setup. ` +
        "Do not retry — tell the user the Space context is unresolved.",
      ok: false,
    };
  }
  const spaceId = ctx.space?.spaceId?.trim();
  if (!spaceId) {
    return {
      code: "no_space",
      message:
        "This chat is not in a Space, so there is nothing to set up. Apps and accounts belong to a Space — ask the user to open the Space they mean and repeat the request there.",
      ok: false,
    };
  }
  const coreBaseUrl = ctx.coreBaseUrl ?? getEngentyCoreBaseUrlFromEnv();
  const accessToken = ctx.accessToken?.trim();
  if (!(coreBaseUrl && accessToken)) {
    return {
      code: "unauthorized",
      message: `${SPACE_SETUP_TOOL_ID} is unavailable in this run (no core access token).`,
      ok: false,
    };
  }
  return { accessToken, coreBaseUrl, ok: true, spaceId };
}

/**
 * Core's refusal, said the way the model must repeat it.
 *
 * A 403 is a fact about who the user is, not a transient failure, and a model
 * told "forbidden" retries.
 */
function toFailure(error: unknown, action: string) {
  if (error instanceof EngentyCoreHttpError && error.status === 403) {
    return {
      code: "forbidden" as const,
      message:
        `Only a workspace admin — or the owner of a personal Space — may ${action} in a Space. ` +
        "Do not retry. Tell the user an admin has to do it in the Space's setup.",
      ok: false as const,
    };
  }
  return {
    code:
      error instanceof EngentyCoreHttpError ? error.code : "space_setup_failed",
    message:
      error instanceof Error ? error.message : `${SPACE_SETUP_TOOL_ID} failed`,
    ok: false as const,
  };
}

/** Accounts by connection id, with the label a person would recognise. */
function accountIndex(catalog: ConnectorsCatalog) {
  const byId = new Map<
    string,
    { connector_id: string; connector_name: string; label: string }
  >();
  for (const connector of catalog.connectors ?? []) {
    for (const connection of connector.connections ?? []) {
      byId.set(connection.id, {
        connector_id: connector.id,
        connector_name: connector.name ?? connector.id,
        label:
          connection.display_name?.trim() ||
          connection.external_account?.trim() ||
          (connector.name ?? connector.id),
      });
    }
  }
  return byId;
}

export function createSpaceSetupTools(deps: SpaceSetupToolDeps = {}) {
  const coreClientFor = deps.coreClientFor ?? defaultCoreClient;

  const space_setup = createTool({
    id: SPACE_SETUP_TOOL_ID,
    description:
      "What this Space has and adding apps to it — the same setup a workspace " +
      "admin performs in the Space's dialog. action='list' returns the apps " +
      "in this Space with the access this Space's engentys have, the accounts " +
      "this Space owns, and what other apps could be added. action='add' " +
      "takes modules: access 'write' lets this Space's engentys change the " +
      "app's data, 'read' lets them only look, 'none' shows the app to people " +
      "and gives engentys nothing. Accounts are not added here — an account " +
      "belongs to the Space it is connected in, and every engenty here uses " +
      "it. Adding an app that needs an account (Inbox needs a mailbox) answers " +
      "needs_connect — offer the connect in this Space " +
      "(connections_request_connect). action='remove' (confirmed=true) takes " +
      "an app out, which HIDES its records here and never deletes them. An " +
      "app's own first-use setup runs inside add (the Knowledge Base " +
      "creates the Space's knowledge base, named <space>-kb); `mounted` says " +
      "whether each app is ready or what it still needs. Call this when the " +
      "user asks for an app or their email/files in this Space. A newly added " +
      "app's tools arrive on the next message, not inside this turn — say so.",
    inputSchema: z.object({
      action: z.enum(["list", "add", "remove"]),
      confirmed: z
        .boolean()
        .optional()
        .describe("Required true for action='remove'."),
      modules: z
        .array(
          z.object({
            access: z.enum(["none", "read", "write"]).optional(),
            id: z
              .string()
              .describe("Module id from action='list', e.g. 'inbox'."),
          })
        )
        .optional()
        .describe("Apps to add. Default access 'write'."),
      remove: z
        .object({ id: z.string().describe("Module id to take out.") })
        .optional()
        .describe("What action='remove' takes out."),
    }),
    execute: async (input) => {
      const target = resolveTarget();
      if (!target.ok) {
        return target;
      }
      const core = coreClientFor({
        accessToken: target.accessToken,
        coreBaseUrl: target.coreBaseUrl,
      });

      /**
       * The connectors catalog, or null when this run cannot read it. Only
       * labels and availability come from here — never a decision.
       */
      const readCatalog = async (): Promise<ConnectorsCatalog | null> => {
        try {
          return await core.invokeTool<
            Record<string, never>,
            ConnectorsCatalog
          >("connections_catalog", {});
        } catch {
          return null;
        }
      };

      if (input.action === "list") {
        try {
          const [surface, catalog, connectors] = await Promise.all([
            core.getSpaceSurface(target.spaceId),
            core.getSpaceSetupCatalog(),
            readCatalog(),
          ]);
          const moduleNames = new Map(
            catalog.modules.map((module) => [module.id, module.name] as const)
          );
          const accounts = accountIndex(connectors ?? {});
          const mountedModuleIds = new Set(
            surface.modules.map((module) => module.moduleId)
          );
          return {
            available_modules: catalog.modules
              .filter((module) => !mountedModuleIds.has(module.id))
              .map((module) => ({
                description: module.description,
                module_id: module.id,
                name: module.name,
              })),
            // Accounts this Space owns — every engenty here uses them.
            accounts: surface.connections.map((id) => ({
              account_id: id,
              ...(accounts.get(id)
                ? { connector_id: accounts.get(id)?.connector_id }
                : {}),
              name: accounts.get(id)?.label ?? id,
            })),
            modules: surface.modules.map((module) => ({
              access: module.agentAccess,
              is_required: module.isRequired,
              module_id: module.moduleId,
              name: moduleNames.get(module.moduleId) ?? module.moduleId,
            })),
            ok: true as const,
            space_id: target.spaceId,
          };
        } catch (error) {
          return toFailure(error, "read this Space's setup");
        }
      }

      if (input.action === "add") {
        const mounts = (input.modules ?? [])
          .map((module) => ({
            agent_access: module.access ?? ("write" as const),
            resource_key: module.id.trim(),
            resource_type: "module" as const,
          }))
          .filter((mount) => mount.resource_key);
        if (mounts.length === 0) {
          return {
            code: "nothing_to_add" as const,
            message: `${SPACE_SETUP_TOOL_ID}: action='add' needs modules. Call action='list' for the ids. Accounts are connected in this Space with connections_request_connect.`,
            ok: false as const,
          };
        }
        let result: Awaited<ReturnType<typeof core.postSpaceSetupAdd>>;
        try {
          result = await core.postSpaceSetupAdd(target.spaceId, mounts);
        } catch (error) {
          return toFailure(error, "add apps");
        }
        // The next turn assembles its tool surface from the cached surface;
        // without this the copilot would report what it just added as still
        // missing for up to the cache TTL.
        invalidateRunSpaceSurface(target.spaceId);
        const needsConnect = result.needs_connect ?? [];
        // A binding that did not finish is the difference between "the mailbox
        // is here" and "the mail is here" — never fold it into success.
        const bindingFailures = (result.bound ?? []).filter(
          (entry) => entry.error
        );
        // An app placed with a setup that did not finish is not "added" in
        // the sense the user means — say what it still needs.
        const notReady = (result.mounted ?? []).filter((entry) => !entry.ready);
        return {
          added: result.added,
          ...(result.bound?.length ? { bound: result.bound } : {}),
          ...(result.mounted?.length ? { mounted: result.mounted } : {}),
          // Say what is still missing IN THIS ANSWER. An app that needs a
          // mailbox is not an error and not a finished job either.
          ...(needsConnect.length > 0
            ? {
                message:
                  `${needsConnect.map((need) => need.module_id).join(", ")} is in this Space but has no account to work with yet. ` +
                  "Offer to connect one in this Space (connections_request_connect); the app picks it up once it is connected.",
                needs_connect: needsConnect,
              }
            : bindingFailures.length > 0
              ? {
                  message:
                    `Added, but ${bindingFailures.map((entry) => entry.module_id).join(", ")} could not finish setting the account up: ` +
                    `${bindingFailures[0].error}. Say so — the app and the account are in this Space, and that step can be retried.`,
                }
              : notReady.length > 0
                ? {
                    message:
                      `Added, but ${notReady.map((entry) => entry.module_id).join(", ")} is not ready: ` +
                      `${notReady.map((entry) => entry.error ?? `needs ${entry.needs.join(", ")}`).join("; ")}. ` +
                      "Say so — the app is in this Space; a missing tenant setting is fixed once by an admin, and re-adding the app retries its setup.",
                  }
                : {
                    message:
                      "Added. The tools become available on the next message — tell the user to say what they want done and it will run then.",
                  }),
          ok: true as const,
          space_id: target.spaceId,
        };
      }

      const removal = input.remove;
      if (!removal?.id.trim()) {
        return {
          code: "nothing_to_remove" as const,
          message: `${SPACE_SETUP_TOOL_ID}: action='remove' requires remove: { id }.`,
          ok: false as const,
        };
      }
      if (input.confirmed !== true) {
        return {
          code: "confirmation_required" as const,
          message:
            `Removing ${removal.id} takes it out of this Space and hides what it shows here. ` +
            "Ask the user first, then call again with confirmed=true.",
          ok: false as const,
        };
      }
      try {
        await core.deleteSpaceMount(
          target.spaceId,
          "module",
          removal.id.trim()
        );
      } catch (error) {
        return toFailure(error, "remove apps");
      }
      invalidateRunSpaceSurface(target.spaceId);
      return {
        message:
          `${removal.id} is no longer part of this Space. ` +
          "Its records still exist — they are hidden here, not deleted.",
        ok: true as const,
        removed: removal,
        space_id: target.spaceId,
      };
    },
  });

  return { [SPACE_SETUP_TOOL_ID]: space_setup };
}
