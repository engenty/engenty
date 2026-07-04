import { DOMParser } from "@xmldom/xmldom";
import type { NodeAST } from "../types";

function splitStyleMaybe(value?: string | null): string | string[] | undefined {
  if (!value) {
    return;
  }
  const parts = value.split(/\s+/).filter(Boolean);
  if (!parts.length) {
    return;
  }
  return parts.length === 1 ? parts[0] : parts;
}

function visitElement(el: Element): NodeAST {
  switch (el.tagName) {
    case "Document":
      return { type: "Document", children: elementChildren(el) };
    case "Page":
      return {
        type: "Page",
        size: el.getAttribute("size") ?? undefined,
        style: splitStyleMaybe(el.getAttribute("style")),
        children: elementChildren(el),
      };
    case "View": {
      const breakAttr = el.getAttribute("break");
      return {
        type: "View",
        break: breakAttr === "true" || breakAttr === "1" || breakAttr === "yes",
        style: splitStyleMaybe(el.getAttribute("style")),
        children: elementChildren(el),
      };
    }
    case "Text":
      return {
        type: "Text",
        style: splitStyleMaybe(el.getAttribute("style")),
        text: (el.textContent ?? "").trim(),
      };
    case "Image":
      return {
        type: "Image",
        style: splitStyleMaybe(el.getAttribute("style")),
        src: el.getAttribute("src") ?? undefined,
      };
    case "Link":
      return {
        type: "Link",
        style: splitStyleMaybe(el.getAttribute("style")),
        href: el.getAttribute("href") ?? undefined,
        text: (el.textContent ?? "").trim(),
      };
    default:
      return {
        type: "View",
        style: splitStyleMaybe(el.getAttribute("style")),
        children: elementChildren(el),
      };
  }
}

function elementChildren(el: Element): NodeAST[] {
  const out: NodeAST[] = [];
  for (let i = 0; i < el.childNodes.length; i += 1) {
    const child = el.childNodes.item(i);
    if (child?.nodeType === 1) {
      out.push(visitElement(child as Element));
    }
  }
  return out;
}

export function xmlToAst(xml: string): NodeAST {
  const parser = new DOMParser({
    onError: () => {
      /* xmldom 0.9+: errorHandler object removed; ignore non-fatal noise for trusted templates */
    },
  });
  const doc = parser.parseFromString(xml, "text/xml");
  const root = doc.documentElement;
  if (root?.tagName !== "Document") {
    throw new Error("Root element <Document> expected");
  }
  return visitElement(root);
}
