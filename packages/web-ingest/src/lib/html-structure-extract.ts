import { parseHTML } from "linkedom";
import type {
  WebIngestLink,
  WebIngestLinkType,
  WebIngestMedia,
  WebIngestMediaType,
  WebIngestSection,
} from "../types.js";

const DOCUMENT_EXTENSIONS = new Set([
  "pdf",
  "doc",
  "docx",
  "ppt",
  "pptx",
  "xls",
  "xlsx",
  "csv",
  "zip",
]);

function wrapFragmentAsDocument(html: string): string {
  const trimmed = html.trim();
  if (/^<!DOCTYPE/i.test(trimmed) || /<\s*html[\s>]/i.test(trimmed)) {
    return trimmed;
  }
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${html}</body></html>`;
}

function normalizeUrl(
  raw: string | null | undefined,
  baseUrl: string
): string | null {
  const value = raw?.trim();
  if (!value) {
    return null;
  }
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return null;
  }
}

function extensionFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const last = pathname.split("/").pop() ?? "";
    const ext = last.includes(".") ? last.split(".").pop() : "";
    return ext?.toLowerCase() ?? "";
  } catch {
    return "";
  }
}

function numberAttr(element: Element, name: string): number | null {
  const raw = element.getAttribute(name)?.trim();
  if (!raw) {
    return null;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function nearbyCaption(element: Element): string | null {
  const figure = element.closest("figure");
  const caption = figure?.querySelector("figcaption")?.textContent?.trim();
  return caption || null;
}

function classifyMediaFromElement(
  element: Element,
  url: string
): WebIngestMediaType {
  const tag = element.tagName.toLowerCase();
  if (tag === "img" || tag === "source" || tag === "picture") {
    return "image";
  }
  if (tag === "video") {
    return "video";
  }
  if (tag === "audio") {
    return "audio";
  }
  if (tag === "iframe") {
    return "iframe";
  }
  return DOCUMENT_EXTENSIONS.has(extensionFromUrl(url)) ? "document" : "other";
}

function guessContentType(
  url: string,
  mediaType: WebIngestMediaType
): string | null {
  const ext = extensionFromUrl(url);
  if (ext === "pdf") {
    return "application/pdf";
  }
  if (["jpg", "jpeg"].includes(ext)) {
    return "image/jpeg";
  }
  if (["png", "gif", "webp", "svg", "avif"].includes(ext)) {
    return `image/${ext === "svg" ? "svg+xml" : ext}`;
  }
  if (["mp4", "webm", "ogg"].includes(ext) && mediaType === "video") {
    return `video/${ext}`;
  }
  if (["mp3", "wav", "ogg"].includes(ext) && mediaType === "audio") {
    return `audio/${ext}`;
  }
  return null;
}

function classifyLink(href: string, baseUrl: string): WebIngestLinkType {
  if (href.startsWith("#")) {
    return "anchor";
  }
  if (DOCUMENT_EXTENSIONS.has(extensionFromUrl(href))) {
    return "asset";
  }
  try {
    const base = new URL(baseUrl);
    const url = new URL(href);
    if (
      url.hash &&
      url.origin === base.origin &&
      url.pathname === base.pathname
    ) {
      return "anchor";
    }
    return url.origin === base.origin ? "internal" : "external";
  } catch {
    return "external";
  }
}

export function extractWebIngestStructureFromHtml(
  html: string,
  baseUrl: string
): { links: WebIngestLink[]; media: WebIngestMedia[] } {
  const { document } = parseHTML(wrapFragmentAsDocument(html));
  const media: WebIngestMedia[] = [];
  const links: WebIngestLink[] = [];
  const seenMedia = new Set<string>();

  const mediaElements = [
    ...document.querySelectorAll("img, picture source, video, audio, iframe"),
  ];
  for (const element of mediaElements) {
    const rawSrc =
      element.getAttribute("src") ||
      element.getAttribute("data-src") ||
      element.getAttribute("poster") ||
      element.getAttribute("srcset")?.split(",")[0]?.trim().split(/\s+/)[0];
    const sourceUrl = normalizeUrl(rawSrc, baseUrl);
    if (!sourceUrl || seenMedia.has(sourceUrl)) {
      continue;
    }
    seenMedia.add(sourceUrl);
    const mediaType = classifyMediaFromElement(element, sourceUrl);
    media.push({
      alt_text: element.getAttribute("alt")?.trim() || null,
      content_type: guessContentType(sourceUrl, mediaType),
      description: nearbyCaption(element),
      height: numberAttr(element, "height"),
      media_type: mediaType,
      metadata: {},
      position: media.length,
      source_url: sourceUrl,
      title: element.getAttribute("title")?.trim() || null,
      width: numberAttr(element, "width"),
    });
  }

  for (const anchor of document.querySelectorAll("a[href]")) {
    const rawHref = anchor.getAttribute("href") ?? "";
    const normalizedHref = normalizeUrl(rawHref, baseUrl);
    if (!normalizedHref) {
      continue;
    }
    const linkType = classifyLink(normalizedHref, baseUrl);
    links.push({
      href: rawHref,
      link_type: linkType,
      metadata: {},
      normalized_href: normalizedHref,
      position: links.length,
      rel: anchor.getAttribute("rel")?.trim() || null,
      text: anchor.textContent?.trim() || null,
      title: anchor.getAttribute("title")?.trim() || null,
    });
    if (linkType === "asset" && !seenMedia.has(normalizedHref)) {
      seenMedia.add(normalizedHref);
      media.push({
        alt_text: null,
        content_type: guessContentType(normalizedHref, "document"),
        description: anchor.textContent?.trim() || null,
        height: null,
        media_type: "document",
        metadata: { from_link: true },
        position: media.length,
        source_url: normalizedHref,
        title:
          anchor.getAttribute("title")?.trim() ||
          anchor.textContent?.trim() ||
          null,
        width: null,
      });
    }
  }

  return { links, media };
}

export function buildWebIngestSections(args: {
  cleanHtml?: string | null;
  markdown: string;
  rawHtml?: string | null;
}): WebIngestSection[] {
  const sections: WebIngestSection[] = [];
  if (args.rawHtml?.trim()) {
    sections.push({
      content: args.rawHtml,
      kind: "html",
      locator: "raw_html",
      metadata: { role: "raw_html" },
      position: sections.length,
      title: "Raw HTML",
    });
  }
  if (args.cleanHtml?.trim()) {
    sections.push({
      content: args.cleanHtml,
      kind: "html",
      locator: "clean_html",
      metadata: { role: "clean_html" },
      position: sections.length,
      title: "Clean HTML",
    });
  }
  if (args.markdown.trim()) {
    sections.push({
      content: args.markdown,
      kind: "markdown",
      locator: "markdown",
      metadata: { role: "markdown" },
      position: sections.length,
      title: "Markdown",
    });
  }
  return sections;
}
