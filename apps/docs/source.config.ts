import {
  rehypeCodeDefaultOptions,
  remarkMdxMermaid,
} from "fumadocs-core/mdx-plugins";
import {
  type DocsCollection,
  defineConfig,
  defineDocs,
  frontmatterSchema,
  metaSchema,
} from "fumadocs-mdx/config";
import { transformerTwoslash } from "fumadocs-twoslash";
import { z } from "zod";

// Custom frontmatter schema extending the default one with page status
const customFrontmatterSchema = frontmatterSchema.extend({
  status: z.enum(["draft", "outdated", "needs-work", "approved"]).optional(),
});

// You can customise Zod schemas for frontmatter and `meta.json` here
// see https://fumadocs.dev/docs/mdx/collections
export const docs: DocsCollection<
  typeof customFrontmatterSchema,
  typeof metaSchema
> = defineDocs({
  dir: "../../docs/content",
  docs: {
    schema: customFrontmatterSchema,
    postprocess: {
      includeProcessedMarkdown: true,
    },
  },
  meta: {
    schema: metaSchema,
  },
});

// Internal docs (planning, drafts, deep-dives) live in docs/internal — a sibling
// of the published docs/content. Served locally at /docs/internal/* for reference
// but NEVER published: the OSS assembler copies only docs/content, leaving the
// released repo with an empty docs/internal, so this collection resolves to no
// pages and the route 404s there.
export const internalDocs: DocsCollection<
  typeof customFrontmatterSchema,
  typeof metaSchema
> = defineDocs({
  dir: "../../docs/internal",
  docs: {
    schema: customFrontmatterSchema,
    postprocess: {
      includeProcessedMarkdown: true,
    },
  },
  meta: {
    schema: metaSchema,
  },
});

/** Shiki langs for code blocks; Twoslash needs explicit langs (no lazy popups). */
const CODE_LANGS = [
  "bash",
  "css",
  "html",
  "js",
  "jsx",
  "json",
  "md",
  "mdx",
  "shellscript",
  "ts",
  "tsx",
] as const;

export default defineConfig({
  mdxOptions: {
    // Run before GFM/heading so ```mermaid fences become <Mermaid /> reliably.
    remarkPlugins: (preset) => [remarkMdxMermaid, ...preset],
    rehypeCodeOptions: {
      ...rehypeCodeDefaultOptions,
      themes: {
        light: "github-light",
        dark: "github-dark",
      },
      transformers: [
        ...(rehypeCodeDefaultOptions.transformers ?? []),
        transformerTwoslash(),
      ],
      langs: [...CODE_LANGS],
    },
  },
});
