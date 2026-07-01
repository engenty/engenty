import { type JSONContent, jsonToMarkdown } from "@engenty/tiptap-editor";
import { marked } from "marked";
import type { Article } from "../../../src/schema/types.js";

const CLIPBOARD_MARKED_OPTS = { async: false as const, gfm: true };

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const FILENAME_ILLEGAL = new Set(Array.from('<>:"/\\|?*'));

export function safeArticleExportBasename(article: Article): string {
  const raw = article.slug?.trim() || article.title?.trim() || "article";
  const cleaned = Array.from(raw, (ch) => {
    const code = ch.charCodeAt(0);
    if (code < 32 || FILENAME_ILLEGAL.has(ch)) {
      return "-";
    }
    return ch;
  })
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return cleaned.length > 0 ? cleaned : "article";
}

export function articleBodyAsMarkdown(article: Article): string {
  const md = article.content_markdown?.trim();
  if (md) {
    return article.content_markdown ?? "";
  }
  if (article.content_json) {
    try {
      return `${jsonToMarkdown(article.content_json as JSONContent).trimEnd()}\n`;
    } catch {
      return "";
    }
  }
  return "";
}

export function downloadUtf8TextFile(
  filename: string,
  content: string,
  mimeType = "text/markdown;charset=utf-8"
): void {
  const blob = new Blob([content], {
    type: mimeType,
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
}

/**
 * Plain text is Markdown (title as ATX heading + body). HTML is the same body
 * rendered for rich paste (Word, Docs, email clients).
 */
export function articleClipboardPlainAndHtml(article: Article): {
  plainText: string;
  htmlDocument: string;
} {
  const bodyMd = articleBodyAsMarkdown(article);
  const rawTitle = article.title?.trim() ?? "";
  const displayTitle = rawTitle.length > 0 ? rawTitle : "Untitled";
  const bodyTrim = bodyMd.trimEnd();
  const plainText =
    bodyTrim.length > 0
      ? `# ${displayTitle}\n\n${bodyTrim}\n`
      : `# ${displayTitle}\n`;
  const bodyHtml =
    bodyTrim.length > 0
      ? (marked(bodyTrim, CLIPBOARD_MARKED_OPTS) as string)
      : "";
  const titleEscaped = escapeHtml(displayTitle);
  const htmlDocument = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><article><h1>${titleEscaped}</h1>${bodyHtml}</article></body></html>`;
  return { plainText, htmlDocument };
}

/**
 * Writes {@link articleClipboardPlainAndHtml} to the system clipboard.
 * Uses `text/html` + `text/plain` when supported, otherwise `writeText` with plain Markdown.
 */
export async function copyArticleFormattedToClipboard(
  article: Article
): Promise<void> {
  const { plainText, htmlDocument } = articleClipboardPlainAndHtml(article);
  try {
    if (
      typeof ClipboardItem !== "undefined" &&
      typeof navigator.clipboard?.write === "function"
    ) {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([htmlDocument], { type: "text/html" }),
          "text/plain": new Blob([plainText], { type: "text/plain" }),
        }),
      ]);
      return;
    }
  } catch {
    // Fall through to plain text.
  }
  if (typeof navigator.clipboard?.writeText !== "function") {
    throw new Error("Clipboard unavailable");
  }
  await navigator.clipboard.writeText(plainText);
}
