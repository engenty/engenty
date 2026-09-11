/**
 * Server operations for Knowledge Base AI tools (copilot / orchestrator).
 * Core currently bridges these operations for gateway-style AI invocation.
 */
import type { PluginEventsApi, PluginServerApi } from "@engenty/plugin-sdk";
import { z } from "zod";
import { enrichKbWithSettings } from "../../src/dal/shared.js";
import { onlyRequestedKeys } from "../../src/schema/only-requested-keys.js";
import { ensureSpaceKnowledgeBase } from "../../src/services/kb-space-mount.js";
import { registerKbAiGatewayArticleMethods } from "./kb-ai-gateway-articles.js";
import { registerKbAiGatewayFaqMethods } from "./kb-ai-gateway-faqs.js";
import { registerKbAiGatewayInboxMethods } from "./kb-ai-gateway-inbox.js";
import {
  kbCategoriesListInputSchema,
  kbCategoryCreateInputSchema,
  kbCategoryDeleteInputSchema,
  kbCategoryGetInputSchema,
  kbCategoryUpdateInputSchema,
  kbListInputSchema,
  kbSpaceMountInputSchema,
  kbTagCreateInputSchema,
  kbTagsListInputSchema,
  kbUpdateInputSchema,
} from "./kb-ai-gateway-schemas.js";
import {
  KB_SPACE_OWNED_COLLECTION,
  type KbGetRepo,
  kbDestructiveOp,
  kbGatewayOp,
  kbLinksFor,
  kbSpaceOwnedRecord,
  spaceIdFromKbAuth,
} from "./kb-ai-gateway-shared.js";
import { registerKbAiGatewaySourceMethods } from "./kb-ai-gateway-sources.js";
import {
  kbTargetRequired,
  resolveKbIdForScopedRead,
} from "./kb-operation-target.js";

export type { KbGetRepo } from "./kb-ai-gateway-shared.js";

export function registerKbAiGatewayMethods(
  server: Pick<PluginServerApi, "registerOperation" | "getStorageService">,
  getRepo: KbGetRepo,
  events: PluginEventsApi
): void {
  server.registerOperation({
    operationId: "kb_list",
    summary: "List knowledge bases",
    description:
      "The Knowledge Base of current_space (a space has exactly one). Use it to get the kb_id and link before listing articles, FAQs, sources, or running KB search. An empty list means the Knowledge Base module is not mounted in this space, or its setup did not finish — space_setup action='add' modules=[{id:'knowledge-base'}] mounts it and creates the knowledge base.",
    ...kbGatewayOp(true, KB_SPACE_OWNED_COLLECTION),
    inputSchema: kbListInputSchema,
    outputSchema: z.unknown(),
    handler: async (input, ctx) => {
      const repos = getRepo(ctx.auth);
      const parsed = kbListInputSchema.parse(input ?? {});
      const spaceId = parsed.space_id ?? spaceIdFromKbAuth(ctx.auth, input);
      const [kbs, settings] = await Promise.all([
        repos.kb.list(spaceId ? { spaceId } : undefined),
        repos.settings.get(),
      ]);
      return {
        knowledge_bases: await Promise.all(
          kbs.map(async (kb) => ({
            ...enrichKbWithSettings(kb, settings),
            link: (await kbLinksFor(repos, kb))?.hub(),
          }))
        ),
        total: kbs.length,
      };
    },
  });

  /**
   * The module's `mountOperation` (engenty.plugin.json): core calls it with
   * `{ space_id }` from every path that mounts Knowledge Base into a space, and
   * the space's one library is created here and nowhere else. Registered as
   * an operation so it runs as the mounting principal, with the module's own
   * space policy and audit trail.
   */
  server.registerOperation({
    operationId: "kb_space_mount",
    summary: "Set up the space's knowledge base (runs on mount)",
    description:
      "Runs automatically when the Knowledge Base module is mounted into a space (space_setup action='add'): creates the space's one knowledge base when it does not exist yet and reports what it still needs. Idempotent. Not a tool to reach for — mount the module and this runs.",
    idempotent: true,
    moduleId: "knowledge-base",
    requiresApproval: false,
    riskLevel: "low",
    spacePolicy: KB_SPACE_OWNED_COLLECTION,
    inputSchema: kbSpaceMountInputSchema,
    outputSchema: z.unknown(),
    handler: async (input, ctx) => {
      const repos = getRepo(ctx.auth);
      const params = kbSpaceMountInputSchema.parse(input ?? {});
      const spaceId = params.space_id ?? spaceIdFromKbAuth(ctx.auth, input);
      if (!spaceId) {
        return {
          error: "space_id_required",
          message:
            "kb_space_mount needs the space the module was mounted into.",
        };
      }
      const result = await ensureSpaceKnowledgeBase(repos, spaceId);
      return {
        ...result,
        knowledge_base: {
          ...result.knowledge_base,
          link: (await kbLinksFor(repos, result.knowledge_base))?.hub(),
        },
      };
    },
  });

  server.registerOperation({
    operationId: "kb_update",
    summary: "Rename or re-describe a knowledge base",
    description:
      "Update a Knowledge Base's name or description (a fresh one is named <space>-kb). Structure inside the KB is managed with the category operations.",
    ...kbGatewayOp(false, kbSpaceOwnedRecord("kb_id")),
    inputSchema: kbUpdateInputSchema,
    outputSchema: z.unknown(),
    handler: async (input, ctx) => {
      const repos = getRepo(ctx.auth);
      const params = kbUpdateInputSchema.parse(input ?? {});
      const { kb_id, ...patch } = params;
      if (Object.keys(patch).length === 0) {
        return { error: "Nothing to update — pass name and/or description." };
      }
      const kb = await repos.kb.update(kb_id, patch);
      if (!kb) {
        return { error: "Knowledge base not found" };
      }
      return {
        knowledge_base: { ...kb, link: (await kbLinksFor(repos, kb))?.hub() },
      };
    },
  });

  server.registerOperation({
    operationId: "kb_tags_list",
    summary: "List tags of a knowledge base",
    description:
      "List the tags defined in a Knowledge Base, with ids for kb_article_create/kb_article_update tag_ids.",
    ...kbGatewayOp(true, KB_SPACE_OWNED_COLLECTION),
    inputSchema: kbTagsListInputSchema,
    outputSchema: z.unknown(),
    handler: async (input, ctx) => {
      const repos = getRepo(ctx.auth);
      const params = kbTagsListInputSchema.parse(input ?? {});
      const kbId = await resolveKbIdForScopedRead(
        repos,
        params.kb_id,
        spaceIdFromKbAuth(ctx.auth, input)
      );
      if (!kbId) {
        return kbTargetRequired(
          repos,
          spaceIdFromKbAuth(ctx.auth, input),
          params.kb_id
        );
      }
      const tags = await repos.tags.list(kbId);
      return { tags, total: tags.length };
    },
  });

  server.registerOperation({
    operationId: "kb_tag_create",
    summary: "Create a KB tag",
    description:
      "Create a tag in a Knowledge Base for cross-cutting labels on articles (attach via tag_ids). Check kb_tags_list first — never create a duplicate.",
    ...kbGatewayOp(false, KB_SPACE_OWNED_COLLECTION),
    inputSchema: kbTagCreateInputSchema,
    outputSchema: z.unknown(),
    handler: async (input, ctx) => {
      const repos = getRepo(ctx.auth);
      const params = kbTagCreateInputSchema.parse(input ?? {});
      const kbId = await resolveKbIdForScopedRead(
        repos,
        params.kb_id,
        spaceIdFromKbAuth(ctx.auth, input)
      );
      if (!kbId) {
        return kbTargetRequired(
          repos,
          spaceIdFromKbAuth(ctx.auth, input),
          params.kb_id
        );
      }
      const slug = params.name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
      const tag = await repos.tags.create({
        color: params.color ?? null,
        kb_id: kbId,
        name: params.name.trim(),
        slug: slug || "tag",
      });
      return { tag };
    },
  });

  registerKbAiGatewayArticleMethods(server, getRepo);
  registerKbAiGatewayFaqMethods(server, getRepo);

  server.registerOperation({
    operationId: "kb_categories_list",
    summary: "List KB Categories",
    description:
      "List all folders and categories in a specific Knowledge Base in current_space. Never fall back to the tenant default KB when a Space or current KB is known.",
    ...kbGatewayOp(true, KB_SPACE_OWNED_COLLECTION),
    inputSchema: kbCategoriesListInputSchema,
    outputSchema: z.unknown(),
    handler: async (input, ctx) => {
      const repos = getRepo(ctx.auth);
      const params = kbCategoriesListInputSchema.parse(input ?? {});
      const kbId = await resolveKbIdForScopedRead(
        repos,
        params.kb_id,
        spaceIdFromKbAuth(ctx.auth, input)
      );
      if (!kbId) {
        return kbTargetRequired(
          repos,
          spaceIdFromKbAuth(ctx.auth, input),
          params.kb_id
        );
      }
      const list = await repos.categories.list(kbId);
      const links = await kbLinksFor(repos, kbId);
      return {
        categories: list.map((category) => ({
          ...category,
          link: links?.category(category.slug),
        })),
        total: list.length,
      };
    },
  });

  server.registerOperation({
    operationId: "kb_category_create",
    summary: "Create a KB Category",
    description:
      "Create a new category folder under a parent or at root, with optional description, view type, template, comments mode, etc.",
    ...kbGatewayOp(false, KB_SPACE_OWNED_COLLECTION),
    inputSchema: kbCategoryCreateInputSchema,
    outputSchema: z.unknown(),
    handler: async (input, ctx) => {
      const repos = getRepo(ctx.auth);
      const params = kbCategoryCreateInputSchema.parse(input ?? {});
      const kbId = await resolveKbIdForScopedRead(
        repos,
        params.kb_id,
        spaceIdFromKbAuth(ctx.auth, input)
      );
      if (!kbId) {
        return kbTargetRequired(
          repos,
          spaceIdFromKbAuth(ctx.auth, input),
          params.kb_id
        );
      }
      const category = await repos.categories.create({
        ...params,
        description: params.description ?? null,
        kb_id: kbId,
        parent_id: params.parent_id ?? null,
      });
      return {
        category_id: category.id,
        link: (await kbLinksFor(repos, kbId))?.category(category.slug),
        name: category.name,
      };
    },
  });

  server.registerOperation({
    operationId: "kb_category_get",
    summary: "Get a KB Category",
    description:
      "Retrieve details, metadata settings, and layout blocks for a specific category folder.",
    ...kbGatewayOp(true, kbSpaceOwnedRecord("category_id")),
    inputSchema: kbCategoryGetInputSchema,
    outputSchema: z.unknown(),
    handler: async (input, ctx) => {
      const repos = getRepo(ctx.auth);
      const params = kbCategoryGetInputSchema.parse(input ?? {});
      const category = await repos.categories.getById(params.category_id);
      if (!category) {
        return { error: "Category not found" };
      }
      return {
        category: {
          ...category,
          link: (await kbLinksFor(repos, category.kb_id))?.category(
            category.slug
          ),
        },
      };
    },
  });

  server.registerOperation({
    operationId: "kb_category_update",
    summary: "Update a KB Category",
    description:
      "Update settings for an existing category (name, slug, view_type, description, template binding, comments mode, page settings).",
    ...kbGatewayOp(false, kbSpaceOwnedRecord("category_id")),
    inputSchema: kbCategoryUpdateInputSchema,
    outputSchema: z.unknown(),
    handler: async (input, ctx) => {
      const repos = getRepo(ctx.auth);
      const params = kbCategoryUpdateInputSchema.parse(input ?? {});
      const category = await repos.categories.getById(params.category_id);
      if (!category) {
        return { error: "Category not found" };
      }
      // Same trap as kb_article_update: the parsed patch re-applies
      // `.default()` fields (`sort_order` back to 0 on every rename).
      const updated = await repos.categories.update(
        params.category_id,
        onlyRequestedKeys(
          (input as { patch?: unknown } | null)?.patch,
          params.patch
        )
      );
      if (!updated) {
        return { error: "Category not found" };
      }
      return {
        category: {
          ...updated,
          link: (await kbLinksFor(repos, updated.kb_id))?.category(
            updated.slug
          ),
        },
      };
    },
  });

  server.registerOperation({
    operationId: "kb_category_delete",
    summary: "Delete a KB Category",
    description:
      "Delete a category. Sibling and child articles will automatically re-parent to the default general category.",
    ...kbDestructiveOp(kbSpaceOwnedRecord("category_id")),
    inputSchema: kbCategoryDeleteInputSchema,
    outputSchema: z.unknown(),
    handler: async (input, ctx) => {
      const repos = getRepo(ctx.auth);
      const params = kbCategoryDeleteInputSchema.parse(input ?? {});
      const category = await repos.categories.getById(params.category_id);
      if (!category) {
        return { error: "Category not found" };
      }
      await repos.categories.delete(params.category_id);
      return { success: true };
    },
  });

  registerKbAiGatewaySourceMethods(server, getRepo);
  registerKbAiGatewayInboxMethods(server, getRepo, events);
}
