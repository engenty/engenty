import type { KbRepoFactory } from "../dal/contracts.js";
import type {
  Article,
  KbArticleTemplate,
  KbCategory,
  KbTemplateBindingMode,
} from "../schema/types.js";

export interface ResolvedKbTemplate {
  source: "article" | "category" | "disabled" | "inherited-none" | "none";
  source_category_id: string | null;
  template: KbArticleTemplate | null;
  template_id: string | null;
}

function normalizeMode(mode: KbTemplateBindingMode | null | undefined) {
  return mode === "none" || mode === "template" ? mode : "inherit";
}

async function templateForId(
  repos: Pick<KbRepoFactory, "templates">,
  id: string | null | undefined
): Promise<KbArticleTemplate | null> {
  if (!id) {
    return null;
  }
  return repos.templates.getById(id);
}

export async function resolveKbTemplateForCategory(
  repos: Pick<KbRepoFactory, "categories" | "templates">,
  category: KbCategory | null
): Promise<ResolvedKbTemplate> {
  let current = category;
  const seen = new Set<string>();
  while (current) {
    if (seen.has(current.id)) {
      break;
    }
    seen.add(current.id);
    const mode = normalizeMode(current.template_mode);
    if (mode === "none") {
      return {
        source: "inherited-none",
        source_category_id: current.id,
        template: null,
        template_id: null,
      };
    }
    if (mode === "template") {
      const template = await templateForId(repos, current.template_id);
      return {
        source: "category",
        source_category_id: current.id,
        template,
        template_id: template?.id ?? current.template_id,
      };
    }
    current = current.parent_id
      ? await repos.categories.getById(current.parent_id)
      : null;
  }
  return {
    source: "none",
    source_category_id: null,
    template: null,
    template_id: null,
  };
}

export async function resolveKbTemplateForArticle(
  repos: Pick<KbRepoFactory, "categories" | "templates">,
  article: Pick<Article, "category_id" | "template_id" | "template_mode"> | null
): Promise<ResolvedKbTemplate> {
  if (!article) {
    return {
      source: "none",
      source_category_id: null,
      template: null,
      template_id: null,
    };
  }
  const mode = normalizeMode(article.template_mode);
  if (mode === "none") {
    return {
      source: "disabled",
      source_category_id: null,
      template: null,
      template_id: null,
    };
  }
  if (mode === "template") {
    const template = await templateForId(repos, article.template_id);
    return {
      source: "article",
      source_category_id: null,
      template,
      template_id: template?.id ?? article.template_id,
    };
  }
  const category = await repos.categories.getById(article.category_id);
  return resolveKbTemplateForCategory(repos, category);
}
