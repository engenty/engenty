// `/ai/skills` — tenant skill catalog backed by file storage (no DB). Lists both
// the read-only `managed` tier and the editable `custom` tier; mutations are
// custom-only (managed skills return 409). Registry routes are provider-agnostic
// (skills.sh is one provider) and install into the custom tier.

import { assertValidAgentSkillName } from "@engenty/ai-core";
import { createLogger } from "@engenty/telemetry";
import type { Hono } from "hono";

import { getEngentyCoreBaseUrlFromEnv } from "../ai/core-http-client.js";
import type { AiSessionScope } from "../ai/sessions.js";
import {
  createDefaultSkillRegistryProviderRegistry,
  type SkillRegistryProviderRegistry,
} from "../ai/skills/providers/registry.js";
import {
  parseSkillMarkdown,
  type SkillFrontmatter,
} from "../ai/skills/skill-frontmatter.js";
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
import {
  collectManagedSkillPacks,
  ensureTenantManagedSkillsSeed,
} from "../ai/workspace/tenant-skills-seed.js";
import { AI_BASE_PATH } from "../config/constants.js";
import type { AiScopeResolver } from "./http.js";
import { handleRouteError, resolveScope } from "./http.js";

const logger = createLogger({ name: "ai.skills.routes" });

export interface RegisterSkillsRoutesOptions {
  providerRegistry?: SkillRegistryProviderRegistry;
  scopeResolver: AiScopeResolver;
}

function buildSkillStorage(scope: AiSessionScope): SkillStorage | null {
  const coreBaseUrl = getEngentyCoreBaseUrlFromEnv();
  const userAccessToken = scope.userAccessToken?.trim();
  if (!(coreBaseUrl && userAccessToken)) {
    return null;
  }
  return createSkillStorage({
    storage: createEngentyCoreFileStorageClient({
      coreBaseUrl,
      userAccessToken,
    }),
    tenantId: scope.tenantId,
  });
}

function buildSkillProposalStore(
  scope: AiSessionScope
): SkillProposalStore | null {
  const coreBaseUrl = getEngentyCoreBaseUrlFromEnv();
  const userAccessToken = scope.userAccessToken?.trim();
  if (!(coreBaseUrl && userAccessToken)) {
    return null;
  }
  return createSkillProposalStore({
    storage: createEngentyCoreFileStorageClient({
      coreBaseUrl,
      userAccessToken,
    }),
    tenantId: scope.tenantId,
  });
}

async function ensureManagedSkillsForCatalog(storage: SkillStorage) {
  try {
    const packs = await collectManagedSkillPacks();
    if (packs.length > 0) {
      await ensureTenantManagedSkillsSeed({ packs, storage });
    }
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
      return c.json({ error: "agent_sessions.unconfiguredCore" }, 503);
    }
    try {
      await ensureManagedSkillsForCatalog(storage);
      const skills = await storage.listSkills();
      return c.json({ skills });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to list skills",
        "agent_sessions.internalError",
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
      return c.json({ error: "agent_sessions.unconfiguredCore" }, 503);
    }
    try {
      return c.json({ proposals: await store.list() });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to list skill proposals",
        "agent_sessions.internalError",
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
      return c.json({ error: "agent_sessions.unconfiguredCore" }, 503);
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
      return c.json({ skill: saved });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to approve skill proposal",
        "agent_sessions.internalError",
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
      return c.json({ error: "agent_sessions.unconfiguredCore" }, 503);
    }
    try {
      const name = c.req.param("name");
      assertValidAgentSkillName(name);
      if (!(await store.get(name))) {
        return c.json({ error: "skills.unknownProposal" }, 404);
      }
      await store.remove(name);
      return c.json({ ok: true });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to reject skill proposal",
        "agent_sessions.internalError",
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
        "agent_sessions.internalError",
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
      return c.json({ error: "agent_sessions.unconfiguredCore" }, 503);
    }
    try {
      const body = (await c.req.json()) as {
        provider?: string;
        ref?: { id?: string };
      };
      const provider = providerRegistry.get(body.provider ?? "");
      const refId = body.ref?.id;
      if (!(provider && refId)) {
        return c.json({ error: "skills.invalidInstallRequest" }, 400);
      }
      const fetched = await provider.fetchSkill({ id: refId });
      const parsed = parseSkillMarkdown(fetched.skillMarkdown);
      assertValidAgentSkillName(fetched.name);
      const saved = await storage.upsertCustomSkill({
        body: parsed.body,
        frontmatter: {
          ...parsed.frontmatter,
          engenty: {
            ...parsed.frontmatter.engenty,
            originRef: refId,
            source: provider.id,
            ...(fetched.sha ? { installedSha: fetched.sha } : {}),
          },
        },
        files: decodeFileInputs(fetched.files),
        name: fetched.name,
      });
      return c.json({ skill: saved });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to install skill",
        "agent_sessions.internalError",
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
      return c.json({ error: "agent_sessions.unconfiguredCore" }, 503);
    }
    try {
      const body = (await c.req.json().catch(() => ({}))) as {
        force?: boolean;
      };
      const force = body.force === true;
      const packs = await collectManagedSkillPacks();
      const result = await ensureTenantManagedSkillsSeed({
        packs,
        storage,
        force,
      });
      return c.json(result);
    } catch (err) {
      return handleRouteError(
        c,
        "failed to reseed managed skills",
        "agent_sessions.internalError",
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
      return c.json({ error: "agent_sessions.unconfiguredCore" }, 503);
    }
    try {
      await ensureManagedSkillsForCatalog(storage);
      const skill = await storage.getSkill(c.req.param("name"));
      if (!skill) {
        return c.json({ error: "agent_sessions.notFound" }, 404);
      }
      return c.json({ skill });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to get skill",
        "agent_sessions.internalError",
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
      return c.json({ error: "agent_sessions.unconfiguredCore" }, 503);
    }
    try {
      const bytes = await storage.readSkillFile(
        c.req.param("name"),
        c.req.param("path")
      );
      if (!bytes) {
        return c.json({ error: "agent_sessions.notFound" }, 404);
      }
      return new Response(bytes as BodyInit, {
        headers: { "content-type": "application/octet-stream" },
      });
    } catch (err) {
      return handleRouteError(
        c,
        "failed to read skill file",
        "agent_sessions.internalError",
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
      return c.json({ error: "agent_sessions.unconfiguredCore" }, 503);
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
        "agent_sessions.internalError",
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
      return c.json({ error: "agent_sessions.unconfiguredCore" }, 503);
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
        "agent_sessions.internalError",
        err
      );
    }
  });
}
