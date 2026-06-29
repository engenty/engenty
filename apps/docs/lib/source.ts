import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { type InferPageType, loader } from "fumadocs-core/source";
import { lucideIconsPlugin } from "fumadocs-core/source/lucide-icons";
import { docs, internalDocs } from "@/.source/server";

export const source = loader({
  baseUrl: "/docs",
  source: docs.toFumadocsSource(),
  plugins: [lucideIconsPlugin()],
});

// Internal docs (docs/internal) — served at /docs/internal/* for local reference.
// Empty in the released repo (the assembler copies only docs/content), so the
// route simply has no pages there.
export const internalSource = loader({
  baseUrl: "/docs/internal",
  source: internalDocs.toFumadocsSource(),
  plugins: [lucideIconsPlugin()],
});

export function getPageImage(page: InferPageType<typeof source>) {
  // Extract segments from page.url (e.g., '/docs/architecture/engenty-monorepo-structure' -> [...])
  const urlSegments = page.url.split("/").filter(Boolean).slice(1); // Remove empty strings and 'docs' prefix
  const segments = [...urlSegments, "image.webp"];
  return {
    segments,
    url: `/og/docs/${segments.join("/")}`,
  };
}

function stripFrontmatter(markdown: string) {
  // Matches YAML frontmatter only when it is at the very start of the file.
  return markdown.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, "");
}

const docsContentRoot = join(process.cwd(), "..", "..", "docs", "content");

export async function getLLMText(page: InferPageType<typeof source>) {
  const absoluteContentPath = join(docsContentRoot, page.path);
  const raw = await readFile(absoluteContentPath, "utf8");
  const body = stripFrontmatter(raw).trim();

  return [
    `# ${page.data.title}`,
    page.data.description ? page.data.description : null,
    `URL: ${page.url}`,
    "",
    body,
  ]
    .filter((v): v is string => Boolean(v))
    .join("\n\n");
}
