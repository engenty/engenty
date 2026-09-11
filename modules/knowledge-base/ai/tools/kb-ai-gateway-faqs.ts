import { z } from "zod";
import { onlyRequestedKeys } from "../../src/schema/only-requested-keys.js";
import {
  kbFaqCreateInputSchema,
  kbFaqDeleteInputSchema,
  kbFaqsListInputSchema,
  kbFaqUpdateInputSchema,
} from "./kb-ai-gateway-schemas.js";
import {
  KB_SPACE_OWNED_COLLECTION,
  type KbGatewayServer,
  type KbGetRepo,
  kbDestructiveOp,
  kbGatewayOp,
  kbLinksFor,
  kbSpaceOwnedRecord,
  spaceIdFromKbAuth,
} from "./kb-ai-gateway-shared.js";
import {
  kbTargetRequired,
  resolveKbIdForScopedRead,
} from "./kb-operation-target.js";

export function registerKbAiGatewayFaqMethods(
  server: KbGatewayServer,
  getRepo: KbGetRepo
): void {
  server.registerOperation({
    operationId: "kb_faqs_list",
    summary: "List KB FAQs",
    description:
      "List FAQ entries for a Knowledge Base in current_space. Use this when the user asks for questions and answers, FAQs, or help-center FAQ content; pass kb_id for a specific Knowledge Base. Never fall back to the tenant default KB when a Space or current KB is known.",
    ...kbGatewayOp(true, KB_SPACE_OWNED_COLLECTION),
    inputSchema: kbFaqsListInputSchema,
    outputSchema: z.unknown(),
    handler: async (input, ctx) => {
      const repos = getRepo(ctx.auth);
      const params = kbFaqsListInputSchema.parse(input ?? {});
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
      const result = await repos.faqs.listPaginated({
        kb_id: kbId,
        page: 1,
        page_size: params.page_size,
        search: params.search,
      });
      const links = await kbLinksFor(repos, kbId);
      return {
        faqs: result.data.map((f) => ({
          answer: f.answer_markdown,
          id: f.id,
          link: links?.faq(f.id),
          question: f.question,
          status: f.status,
        })),
        total: result.total,
      };
    },
  });

  server.registerOperation({
    operationId: "kb_faq_create",
    summary: "Create a KB FAQ entry",
    description:
      "Create a new Q&A FAQ entry in a Knowledge Base in current_space. Never fall back to the tenant default KB when a Space or current KB is known.",
    ...kbGatewayOp(false, KB_SPACE_OWNED_COLLECTION),
    inputSchema: kbFaqCreateInputSchema,
    outputSchema: z.unknown(),
    handler: async (input, ctx) => {
      const repos = getRepo(ctx.auth);
      const params = kbFaqCreateInputSchema.parse(input ?? {});
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
      const { tag_ids, ...rest } = params;
      const faq = await repos.faqs.create(
        {
          ...rest,
          answer_json: rest.answer_json ?? null,
          answer_markdown: rest.answer_markdown ?? null,
          kb_id: kbId,
        },
        tag_ids,
        ctx.auth ? { principalId: ctx.auth.principalId } : null
      );
      return {
        faq_id: faq.id,
        link: (await kbLinksFor(repos, kbId))?.faq(faq.id),
        question: faq.question,
      };
    },
  });

  server.registerOperation({
    operationId: "kb_faq_update",
    summary: "Patch a KB FAQ entry",
    description: "Modify question, answer, status, sorting, or tags for a FAQ.",
    ...kbGatewayOp(false, kbSpaceOwnedRecord("faq_id")),
    inputSchema: kbFaqUpdateInputSchema,
    outputSchema: z.unknown(),
    handler: async (input, ctx) => {
      const repos = getRepo(ctx.auth);
      const { faq_id, patch } = kbFaqUpdateInputSchema.parse(input ?? {});
      // Same trap as kb_article_update: `.partial()` does not stop `.default()`
      // from firing, so the parsed patch carries invented `sort_order`/`status`
      // (and tag wipes) for every caller. Apply only the keys actually sent.
      const { tag_ids, ...rest } = onlyRequestedKeys(
        (input as { patch?: unknown } | null)?.patch,
        patch
      );
      const faq = await repos.faqs.update(
        faq_id,
        rest,
        tag_ids,
        ctx.auth ? { principalId: ctx.auth.principalId } : null
      );
      if (!faq) {
        return { error: "FAQ not found" };
      }
      return {
        faq: {
          ...faq,
          link: (await kbLinksFor(repos, faq.kb_id))?.faq(faq.id),
        },
      };
    },
  });

  server.registerOperation({
    operationId: "kb_faq_delete",
    summary: "Delete (soft-delete) a KB FAQ entry",
    description: "Mark a FAQ entry as deleted.",
    ...kbDestructiveOp(kbSpaceOwnedRecord("faq_id")),
    inputSchema: kbFaqDeleteInputSchema,
    outputSchema: z.unknown(),
    handler: async (input, ctx) => {
      const repos = getRepo(ctx.auth);
      const { faq_id } = kbFaqDeleteInputSchema.parse(input ?? {});
      const ok = await repos.faqs.delete(faq_id);
      return { success: ok };
    },
  });
}
