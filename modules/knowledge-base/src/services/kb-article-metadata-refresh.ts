import { readAiGatewayApiKeyFromEnv } from "@engenty/ai-core";
import type { KbRepoFactory } from "../dal/contracts.js";
import type { Article } from "../schema/types.js";
import { extractKbTemplateMetadataFromSource } from "./kb-template-property-extract.js";
import { resolveKbTemplateForArticle } from "./kb-template-resolver.js";

export async function refreshKbArticleMetadata(
  repos: Pick<KbRepoFactory, "articles" | "categories" | "templates">,
  article: Article,
  actor: { principalId?: string | null } = {}
): Promise<Article> {
  if (article.locked_at) {
    throw new Error("Article is locked");
  }
  if (!readAiGatewayApiKeyFromEnv()) {
    throw new Error("AI Gateway is not configured (AI_GATEWAY_API_KEY).");
  }
  const effective = await resolveKbTemplateForArticle(repos, article);
  const template = effective.template;
  const output = await extractKbTemplateMetadataFromSource({
    contentMarkdown: [
      article.summary ? `Summary: ${article.summary}` : "",
      article.content_markdown ?? "",
    ]
      .filter(Boolean)
      .join("\n\n"),
    sourceTitle: article.title,
    template,
  });

  const updated = await repos.articles.update(
    article.id,
    {
      title: output.title.trim(),
      summary: output.summary?.trim() || null,
      custom_properties: {
        ...(article.custom_properties ?? {}),
        ...output.custom_properties,
      },
    },
    undefined,
    actor.principalId ? { principalId: actor.principalId } : null
  );
  if (!updated) {
    throw new Error("Article not found");
  }
  return updated;
}
