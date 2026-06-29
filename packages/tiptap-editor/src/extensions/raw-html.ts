/**
 * Block node that stores and renders raw HTML (iframes, embeds, etc.).
 * Use only for trusted content — no sanitization here.
 */

import { mergeAttributes, Node } from "@tiptap/core";

export const RawHtmlExtension = Node.create({
  name: "rawHtml",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      html: {
        default: "",
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="raw-html"]',
        getAttrs: (el) => {
          const element = el as HTMLElement;
          const encoded = element.getAttribute("data-html");
          if (encoded) {
            try {
              return { html: decodeURIComponent(encoded) };
            } catch {
              return { html: "" };
            }
          }
          return { html: element.innerHTML };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const html = String(HTMLAttributes.html ?? "");
    return [
      "div",
      mergeAttributes(
        {
          "data-type": "raw-html",
          "data-html": encodeURIComponent(html),
          class: "tiptap-raw-html",
        },
        {}
      ),
    ];
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement("div");
      dom.className = "tiptap-raw-html";
      dom.setAttribute("data-type", "raw-html");
      dom.contentEditable = "false";
      dom.innerHTML = (node.attrs.html as string) ?? "";
      return { dom };
    };
  },
});
