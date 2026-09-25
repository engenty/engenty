// `/ai/skills` — tenant skill catalog backed by file storage (no DB). Lists both
// the read-only `managed` tier and the editable `custom` tier; mutations are
// custom-only (managed skills return 409). Registry routes are provider-agnostic
// (skills.sh is one provider) and install into the custom tier.

import { assertValidAgentSkillName } from "@engenty/ai-core";
import { createLogger } from "@engenty/telemetry";
import type { Hono } from "hono";

import {
  EngentyCoreClient,
  getEngentyCoreBaseUrlFromEnv,
} from "../ai/core-http-client.js";
import { type AiSessionScope, scopeAccessToken } from "../ai/sessions.js";
import {
  COMPUTER_SKILL_PROVIDER_ID,
  createComputerSkillProvider,
  parseComputerSkillRef,
} from "../ai/skills/providers/computer-skills-provider.js";
import {
  createDefaultSkillRegistryProviderRegistry,
  type SkillRegistryProviderRegistry,
} from "../ai/skills/providers/registry.js";
import { installSkillFromRegistryAndAttach } from "../ai/skills/registry-install.js";
import type { SkillFrontmatter } from "../ai/skills/skill-frontmatter.js";
import {
  createSkillProposalStore,
  type SkillProposalStore,
} from "../ai/skills/skill-proposals.js";
import {
  createSkillStorage,
  type SkillFileInput,
  SkillReadOnlyError,
  type SkillStorage,
} from "../ai/skills/skill-storage.js";
import { createEngentyCoreFileStorageClient } from "../ai/workspace/core-file-storage-client.js";
import { syncTenantManagedSkills } from "../ai/workspace/tenant-skills-seed.js";
import { AI_BASE_PATH } from "../config/constants.js";
import { createRegistryStore } from "../dal/registry/index.js";
import { createDbSourceFromEnv } from "../infra/tenant-db.js";
import { resolveNotifications } from "../notifications/inbox.js";
import type { AiScopeResolver } from "./http.js";
import { handleRouteError, resolveScope } from "./http.js";

const logger = createLogger({ name: "ai.skills.routes" });

// `skill_propose` files its `skill_proposed` row under this subject (id: the
// proposal's name); a decision here closes it.
const SKILL_PROPOSAL_SUBJECT = "skill_proposal";

async function resolveSkillProposalNotifications(
  tenantId: string,
  name: string
): Promise<void> {
  await resolveNotifications({
    outcome: "decided",
    subjectId: name,
    subjectType: SKILL_PROPOSAL_SUBJECT,
    tenantId,
  });
}

export interface RegisterSkillsRoutesOptions {
  providerRegistry?: SkillRegistryProviderRegistry;
  scopeResolver: AiScopeResolver;
}

function buildSkillStorage(scope: AiSessionScope): SkillStorage | null {
  const coreBaseUrl = getEngentyCoreBaseUrlFromEnv();
  const accessToken = scopeAccessToken(scope)?.trim();
  if (!(coreBaseUrl && accessToken)) {
    return null;
  }
  return createSkillStorage({
    storage: createEngentyCoreFileStorageClient({
      coreBaseUrl,
      accessToken,
    }),
    tenantId: scope.tenantId,
  });
}

function buildSkillProposalStore(
  scope: AiSessionScope
): SkillProposalStore | null {
  const coreBaseUrl = getEngentyCoreBaseUrlFromEnv();
  const accessToken = scopeAccessToken(scope)?.trim();
  if (!(coreBaseUrl && accessToken)) {
    return null;
  }
  return createSkillProposalStore({
    storage: createEngentyCoreFileStorageClient({
      coreBaseUrl,
      accessToken,
    }),
    tenantId: scope.tenantId,
  });
}

async function ensureManagedSkillsForCatalog(
  scope: AiSessionScope,
  storage: SkillStorage
) {
  try {
    await syncTenantManagedSkills({
      storage,
      tenantId: scope.tenantId,
    });
  } catch (error) {
    logger.warn("managed_skills_catalog_seed_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function decodeFileInputs(raw: unknown): SkillFileInput[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const encoder = new TextEncoder();
  const files: SkillFileInput[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const record = entry as Record<string, unknown>;
    const path = typeof record.path === "string" ? record.path : undefined;
    if (!path) {
      continue;
    }
    if (typeof record.contentBase64 === "string") {
      files.push({
        bytes: Uint8Array.from(Buffer.from(record.contentBase64, "base64")),
        path,
        ...(typeof record.contentType === "string"
          ? { contentType: record.contentType }
          : {}),
      });
    } else if (typeof record.text === "string") {
      files.push({ bytes: encoder.encode(record.text), path });
    }
  }
  return files;
}

/**
 * The computer provider for the Space a ref names — only after the caller's
 * own token has read that Space. The ref is client input: without the check,
 * anyone in the tenant could copy skills off a Space they are not in.
 */
async function computerProviderFor(
  refId: string | undefined,
  tenantId: string,
  core: EngentyCoreClient | null
) {
  const ref = refId ? parseComputerSkillRef(refId) : null;
  if (!(ref && core)) {
    return;
  }
  try {
    await core.getSpaceSurface(ref.spaceId);
  } catch {
    return;
  }
  return createComputerSkillProvider({ spaceId: ref.spaceId, tenantId });
}

export function registerSkillsRoutes(
  app: Hono<any>,
  options: RegisterSkillsRoutesOptions
) {
  const { scopeResolver } = options;
  const providerRegistry =
    options.providerRegistry ?? createDefaultSkillRegistryProviderRegistry();

  app.get(`${AI_BASE_PATH}/skills`, async (c) => {
    const resolved = await resolveScope(c, scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    const storage = buildSkillStorage(resolved.scope);
    if (!storage) {
      return c.json({ error: "agent_skills.unconfiguredCore" }, 503);
    }
    try {
      await ensureManagedSkillsForCatalog(resolved.scope, storage);
      const skills = await storage.listSkills();
      return c.json({ skills });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to list skills",
        "agent_skills.internalError",
        err
      );
    }
  });

  // Proposal routes (memory Phase 4b) — agent-drafted skills awaiting human
  // review. Declared before `:name` so `proposals` is not captured as a skill
  // name. Approve copies the draft into the custom tier (discoverable) and
  // removes the proposal; reject just removes it. Managed stays read-only.
  app.get(`${AI_BASE_PATH}/skills/proposals`, async (c) => {
    const resolved = await resolveScope(c, scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    const store = buildSkillProposalStore(resolved.scope);
    if (!store) {
      return c.json({ error: "agent_skills.unconfiguredCore" }, 503);
    }
    try {
      return c.json({ proposals: await store.list() });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to list skill proposals",
        "agent_skills.internalError",
        err
      );
    }
  });

  app.post(`${AI_BASE_PATH}/skills/proposals/:name/approve`, async (c) => {
    const resolved = await resolveScope(c, scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    const store = buildSkillProposalStore(resolved.scope);
    const storage = buildSkillStorage(resolved.scope);
    if (!(store && storage)) {
      return c.json({ error: "agent_skills.unconfiguredCore" }, 503);
    }
    try {
      const name = c.req.param("name");
      assertValidAgentSkillName(name);
      const proposal = await store.get(name);
      if (!proposal) {
        return c.json({ error: "skills.unknownProposal" }, 404);
      }
      if (await storage.managedSkillExists(name)) {
        return c.json({ error: "skills.readOnly" }, 409);
      }
      const saved = await storage.upsertCustomSkill({
        body: proposal.body,
        frontmatter: proposal.frontmatter,
        name,
      });
      await store.remove(name);
      await resolveSkillProposalNotifications(resolved.scope.tenantId, name);
      return c.json({ skill: saved });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to approve skill proposal",
        "agent_skills.internalError",
        err
      );
    }
  });

  app.post(`${AI_BASE_PATH}/skills/proposals/:name/reject`, async (c) => {
    const resolved = await resolveScope(c, scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    const store = buildSkillProposalStore(resolved.scope);
    if (!store) {
      return c.json({ error: "agent_skills.unconfiguredCore" }, 503);
    }
    try {
      const name = c.req.param("name");
      assertValidAgentSkillName(name);
      if (!(await store.get(name))) {
        return c.json({ error: "skills.unknownProposal" }, 404);
      }
      await store.remove(name);
      await resolveSkillProposalNotifications(resolved.scope.tenantId, name);
      return c.json({ ok: true });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to reject skill proposal",
        "agent_skills.internalError",
        err
      );
    }
  });

  // Registry (provider) routes are declared before `:name` so static segments
  // are not captured as a skill name.
  app.get(`${AI_BASE_PATH}/skills/registry/providers`, async (c) => {
    const resolved = await resolveScope(c, scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    return c.json({ providers: providerRegistry.list() });
  });

  app.get(`${AI_BASE_PATH}/skills/registry/search`, async (c) => {
    const resolved = await resolveScope(c, scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    const providerId = c.req.query("provider") ?? "";
    const query = c.req.query("q") ?? "";
    const provider = providerRegistry.get(providerId);
    if (!provider) {
      return c.json({ error: "skills.unknownProvider" }, 400);
    }
    try {
      const results = await provider.search(query);
      return c.json({ results });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to search skill registry",
        "agent_skills.internalError",
        err
      );
    }
  });

  app.post(`${AI_BASE_PATH}/skills/registry/install`, async (c) => {
    const resolved = await resolveScope(c, scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    const storage = buildSkillStorage(resolved.scope);
    if (!storage) {
      return c.json({ error: "agent_skills.unconfiguredCore" }, 503);
    }
    try {
      const body = (await c.req.json()) as {
        agentId?: string;
        attach?: { agentId?: string; spaceId?: string };
        provider?: string;
        ref?: { id?: string };
        spaceId?: string;
      };
      const refId = body.ref?.id;
      const accessToken = scopeAccessToken(resolved.scope)?.trim();
      const coreBaseUrl = getEngentyCoreBaseUrlFromEnv();
      const core =
        accessToken && coreBaseUrl
          ? new EngentyCoreClient({ accessToken, coreBaseUrl })
          : null;
      const provider =
        body.provider === COMPUTER_SKILL_PROVIDER_ID
          ? await computerProviderFor(refId, resolved.scope.tenantId, core)
          : providerRegistry.get(body.provider ?? "");
      if (!(provider && refId)) {
        return c.json({ error: "skills.invalidInstallRequest" }, 400);
      }
      const dbSource = createDbSourceFromEnv();
      const registryStore = dbSource ? createRegistryStore(dbSource) : null;
      const spaceId = body.attach?.spaceId ?? body.spaceId;
      const agentId = body.attach?.agentId ?? body.agentId;
      const installed = await installSkillFromRegistryAndAttach({
        provider,
        refId,
        storage,
        tenantId: resolved.scope.tenantId,
        core,
        registryStore,
        ...(spaceId ? { spaceId } : {}),
        ...(agentId ? { agentId } : {}),
      });
      return c.json({
        attached: installed.attached,
        skill: installed.skill,
      });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to install skill",
        "agent_skills.internalError",
        err
      );
    }
  });

  app.post(`${AI_BASE_PATH}/skills/reseed`, async (c) => {
    const resolved = await resolveScope(c, scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    const storage = buildSkillStorage(resolved.scope);
    if (!storage) {
      return c.json({ error: "agent_skills.unconfiguredCore" }, 503);
    }
    try {
      const body = (await c.req.json().catch(() => ({}))) as {
        force?: boolean;
      };
      const force = body.force === true;
      const result = await syncTenantManagedSkills({
        force,
        storage,
        tenantId: resolved.scope.tenantId,
      });
      return c.json(result);
    } catch (err) {
      return handleRouteError(
        c,
        "failed to reseed managed skills",
        "agent_skills.internalError",
        err
      );
    }
  });

  app.get(`${AI_BASE_PATH}/skills/:name`, async (c) => {
    const resolved = await resolveScope(c, scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    const storage = buildSkillStorage(resolved.scope);
    if (!storage) {
      return c.json({ error: "agent_skills.unconfiguredCore" }, 503);
    }
    try {
      await ensureManagedSkillsForCatalog(resolved.scope, storage);
      const skill = await storage.getSkill(c.req.param("name"));
      if (!skill) {
        return c.json({ error: "agent_skills.notFound" }, 404);
      }
      return c.json({ skill });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to get skill",
        "agent_skills.internalError",
        err
      );
    }
  });

  app.get(`${AI_BASE_PATH}/skills/:name/files/:path{.+}`, async (c) => {
    const resolved = await resolveScope(c, scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    const storage = buildSkillStorage(resolved.scope);
    if (!storage) {
      return c.json({ error: "agent_skills.unconfiguredCore" }, 503);
    }
    try {
      const bytes = await storage.readSkillFile(
        c.req.param("name"),
        c.req.param("path")
      );
      if (!bytes) {
        return c.json({ error: "agent_skills.notFound" }, 404);
      }
      return new Response(bytes as BodyInit, {
        headers: { "content-type": "application/octet-stream" },
      });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to read skill file",
        "agent_skills.internalError",
        err
      );
    }
  });

  app.put(`${AI_BASE_PATH}/skills/:name/files/:path{.+}`, async (c) => {
    const resolved = await resolveScope(c, scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    const storage = buildSkillStorage(resolved.scope);
    if (!storage) {
      return c.json({ error: "agent_skills.unconfiguredCore" }, 503);
    }
    try {
      const name = c.req.param("name");
      const relativePath = c.req.param("path");
      assertValidAgentSkillName(name);
      const body = await c.req.text();
      await storage.writeCustomSkillFile({
        bytes: new TextEncoder().encode(body),
        contentType: "text/plain; charset=utf-8",
        name,
        path: relativePath,
      });
      return c.json({ path: relativePath });
    } catch (err) {
      if (err instanceof SkillReadOnlyError) {
        return c.json({ error: "skills.readOnly" }, 409);
      }
      return handleRouteError(
        c,
        "failed to write skill file",
        "agent_skills.internalError",
        err
      );
    }
  });

  app.put(`${AI_BASE_PATH}/skills/:name`, async (c) => {
    const resolved = await resolveScope(c, scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    const storage = buildSkillStorage(resolved.scope);
    if (!storage) {
      return c.json({ error: "agent_skills.unconfiguredCore" }, 503);
    }
    try {
      const name = c.req.param("name");
      assertValidAgentSkillName(name);
      // A managed (code-provided) skill of the same name is read-only.
      if (await storage.managedSkillExists(name)) {
        return c.json({ error: "skills.readOnly" }, 409);
      }
      const body = (await c.req.json()) as {
        body?: string;
        files?: unknown;
        frontmatter?: Record<string, unknown>;
      };
      const saved = await storage.upsertCustomSkill({
        body: body.body ?? "",
        files: decodeFileInputs(body.files),
        name,
        ...(body.frontmatter
          ? { frontmatter: body.frontmatter as Partial<SkillFrontmatter> }
          : {}),
      });
      return c.json({ skill: saved });
    } catch (err) {
      if (err instanceof SkillReadOnlyError) {
        return c.json({ error: "skills.readOnly" }, 409);
      }
      return handleRouteError(
        c,
        "failed to upsert skill",
        "agent_skills.internalError",
        err
      );
    }
  });

  app.delete(`${AI_BASE_PATH}/skills/:name`, async (c) => {
    const resolved = await resolveScope(c, scopeResolver);
    if (!resolved.ok) {
      return resolved.response;
    }
    const storage = buildSkillStorage(resolved.scope);
    if (!storage) {
      return c.json({ error: "agent_skills.unconfiguredCore" }, 503);
    }
    try {
      const name = c.req.param("name");
      if (await storage.managedSkillExists(name)) {
        return c.json({ error: "skills.readOnly" }, 409);
      }
      const deleted = await storage.deleteCustomSkill(name);
      return c.json({ deleted });
    } catch (err) {
      if (err instanceof SkillReadOnlyError) {
        return c.json({ error: "skills.readOnly" }, 409);
      }
      return handleRouteError(
        c,
        "failed to delete skill",
        "agent_skills.internalError",
        err
      );
    }
  });
}
