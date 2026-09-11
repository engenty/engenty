// skills_find / skills_install: search the public skill registry and install
// into this tenant (optional space mount + custom-agent preferred list).
// The find tool's payload is rendered as an in-chat install card.

import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import {
  EngentyCoreClient,
  getEngentyCoreBaseUrlFromEnv,
} from "../../src/ai/core-http-client.js";
import {
  createDefaultSkillRegistryProviderRegistry,
  type SkillRegistryProviderRegistry,
} from "../../src/ai/skills/providers/registry.js";
import {
  buildSkillsFindPayload,
  installSkillFromRegistryAndAttach,
} from "../../src/ai/skills/registry-install.js";
import {
  createSkillStorage,
  type SkillStorage,
} from "../../src/ai/skills/skill-storage.js";
import { createEngentyCoreFileStorageClient } from "../../src/ai/workspace/core-file-storage-client.js";
import {
  createRegistryStore,
  type RegistryStore,
} from "../../src/dal/registry/index.js";
import { createDbSourceFromEnv } from "../../src/infra/tenant-db.js";
import { getEngentyToolsRunContext } from "./engenty-tools/lib/run-context.js";
import { isUnresolvedSpaceGate } from "./engenty-tools/lib/space-gate.js";

export const SKILLS_FIND_TOOL_ID = "skills_find";
export const SKILLS_INSTALL_TOOL_ID = "skills_install";

const DEFAULT_PROVIDER = "skills_sh";

export interface SkillsFindScopedStorage {
  accessToken: string;
  coreBaseUrl: string;
  storage: Pick<SkillStorage, "listSkills" | "upsertCustomSkill">;
  tenantId: string;
}

export interface SkillsFindToolDeps {
  coreClientFor?: (input: {
    accessToken: string;
    coreBaseUrl: string;
  }) => EngentyCoreClient;
  providerRegistry?: SkillRegistryProviderRegistry;
  registryStoreFor?: () => RegistryStore | null;
  scopedStorageFor?: () => SkillsFindScopedStorage | null;
}

function registryStoreFromEnv(): RegistryStore | null {
  const source = createDbSourceFromEnv();
  if (!source) {
    return null;
  }
  return createRegistryStore(source);
}

function defaultCoreClient(input: {
  accessToken: string;
  coreBaseUrl: string;
}): EngentyCoreClient {
  return new EngentyCoreClient(input);
}

function resolveProvider(
  registry: SkillRegistryProviderRegistry,
  providerId: string | undefined
) {
  const id = providerId?.trim() || DEFAULT_PROVIDER;
  const provider = registry.get(id);
  if (!provider) {
    return { error: `Unknown skill registry provider: ${id}` as const };
  }
  return { provider };
}

function storageFromContext() {
  const ctx = getEngentyToolsRunContext();
  const coreBaseUrl = ctx.coreBaseUrl ?? getEngentyCoreBaseUrlFromEnv();
  const accessToken = ctx.accessToken?.trim();
  const tenantId = ctx.tenantId?.trim();
  if (!(coreBaseUrl && accessToken && tenantId)) {
    return null;
  }
  return {
    accessToken,
    coreBaseUrl,
    storage: createSkillStorage({
      storage: createEngentyCoreFileStorageClient({
        accessToken,
        coreBaseUrl,
      }),
      tenantId,
    }),
    tenantId,
  };
}

export function createSkillsFindTools(deps: SkillsFindToolDeps = {}) {
  const providerRegistry =
    deps.providerRegistry ?? createDefaultSkillRegistryProviderRegistry();
  const coreClientFor = deps.coreClientFor ?? defaultCoreClient;
  const registryStoreFor = deps.registryStoreFor ?? registryStoreFromEnv;
  const scopedStorageFor = deps.scopedStorageFor ?? storageFromContext;

  const skills_find = createTool({
    id: SKILLS_FIND_TOOL_ID,
    description:
      "Search the public skill registry (skills.sh) and offer an in-chat " +
      "install card. Use when the user wants a skill that is not already in " +
      "this workspace. Do not restate the hits in prose — the card is the answer.",
    inputSchema: z.object({
      query: z
        .string()
        .min(1)
        .max(200)
        .describe("Search keywords, e.g. 'pr review' or 'react performance'."),
      provider: z
        .string()
        .optional()
        .describe("Registry id. Default skills_sh."),
    }),
    execute: async (input) => {
      const resolved = resolveProvider(providerRegistry, input.provider);
      if ("error" in resolved) {
        return {
          ok: false as const,
          code: "unknown_provider",
          message: resolved.error,
        };
      }
      const scoped = scopedStorageFor();
      if (!scoped) {
        return {
          ok: false as const,
          code: "unauthorized",
          message:
            "skills_find is unavailable in this run (no core access token).",
        };
      }
      const ctx = getEngentyToolsRunContext();
      if (isUnresolvedSpaceGate(ctx.space)) {
        return {
          ok: false as const,
          code: "space_context_unresolved",
          message:
            `This run claimed a Space (${ctx.space.reason}) but could not resolve it, so skills_find cannot present tenant-wide choices. ` +
            "This is not a missing catalog and not a transient miss — do not retry as if every tenant skill were in this Space. " +
            "Tell the user the Space context is unresolved.",
        };
      }
      const core = coreClientFor({
        accessToken: scoped.accessToken,
        coreBaseUrl: scoped.coreBaseUrl,
      });
      let mountedSkillNames: string[] | undefined;
      if (ctx.space?.spaceId) {
        try {
          const surface = await core.getSpaceSurface(ctx.space.spaceId);
          mountedSkillNames = surface.skills ?? [];
        } catch {
          return {
            ok: false as const,
            code: "space_context_unresolved",
            message:
              "The active Space surface could not be loaded, so skills_find cannot present tenant-wide choices. " +
              "This is not a missing catalog — do not retry as if every tenant skill were in this Space.",
          };
        }
      }
      const agentTypeKey = ctx.agentTypeKey?.trim();
      let agent:
        | { canPrefer: boolean; id: string; preferredSkillIds?: string[] }
        | undefined;
      if (agentTypeKey) {
        const store = registryStoreFor();
        const config = store
          ? await store.getAgentConfig(scoped.tenantId, agentTypeKey)
          : undefined;
        agent = {
          canPrefer: Boolean(config),
          id: agentTypeKey,
          ...(config ? { preferredSkillIds: config.skillIds } : {}),
        };
      }
      const payload = await buildSkillsFindPayload({
        provider: resolved.provider,
        query: input.query,
        storage: scoped.storage,
        ...(ctx.space?.spaceId
          ? { space: { id: ctx.space.spaceId, mountedSkillNames } }
          : {}),
        ...(agent ? { agent } : {}),
      });
      return { ok: true as const, ...payload };
    },
  });

  const skills_install = createTool({
    id: SKILLS_INSTALL_TOOL_ID,
    description:
      "Install a public registry skill into this tenant's custom catalog. " +
      "Optionally mount it on the current space and add it as a preferred " +
      "skill on a custom agent. Prefer the skills_find chat card; call this " +
      "only when the user confirms in text.",
    inputSchema: z.object({
      agent_id: z
        .string()
        .optional()
        .describe(
          "Custom agent id to add as a preferred skill. Default: this run's agent."
        ),
      provider: z
        .string()
        .optional()
        .describe("Registry id. Default skills_sh."),
      ref_id: z
        .string()
        .min(1)
        .describe("Registry slug from skills_find, e.g. owner/repo/skill."),
      space_id: z
        .string()
        .uuid()
        .optional()
        .describe("Space to mount the skill on. Default: this run's space."),
    }),
    execute: async (input) => {
      const resolved = resolveProvider(providerRegistry, input.provider);
      if ("error" in resolved) {
        return {
          ok: false as const,
          code: "unknown_provider",
          message: resolved.error,
        };
      }
      const scoped = scopedStorageFor();
      if (!scoped) {
        return {
          ok: false as const,
          code: "unauthorized",
          message:
            "skills_install is unavailable in this run (no core access token).",
        };
      }
      const ctx = getEngentyToolsRunContext();
      if (isUnresolvedSpaceGate(ctx.space) && !input.space_id?.trim()) {
        return {
          ok: false as const,
          code: "space_context_unresolved",
          message:
            `This run claimed a Space (${ctx.space.reason}) but could not resolve it, so skills_install cannot mount onto it. ` +
            "Install remains tenant-wide only after a Space is available to mount into.",
        };
      }
      const spaceId = input.space_id?.trim() || ctx.space?.spaceId || null;
      const agentId =
        input.agent_id?.trim() || ctx.agentTypeKey?.trim() || null;
      try {
        const result = await installSkillFromRegistryAndAttach({
          provider: resolved.provider,
          refId: input.ref_id,
          storage: scoped.storage,
          tenantId: scoped.tenantId,
          core: coreClientFor({
            accessToken: scoped.accessToken,
            coreBaseUrl: scoped.coreBaseUrl,
          }),
          registryStore: registryStoreFor(),
          ...(spaceId ? { spaceId } : {}),
          ...(agentId ? { agentId } : {}),
        });
        if (result.attached.space && !result.attached.space.ok) {
          return {
            ok: false as const,
            code: "space_mount_failed",
            message:
              result.attached.space.error ??
              "Skill installed for the tenant, but it was not mounted on the Space.",
            ...result,
          };
        }
        return { ok: true as const, ...result };
      } catch (err) {
        return {
          ok: false as const,
          code: "skills_install_failed",
          message: err instanceof Error ? err.message : "skills_install failed",
        };
      }
    },
  });

  return {
    [SKILLS_FIND_TOOL_ID]: skills_find,
    [SKILLS_INSTALL_TOOL_ID]: skills_install,
  };
}
