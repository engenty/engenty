/**
 * Callout block extension for TipTap.
 *
 * Renders a styled callout with type variations: info, warning, tip, caution.
 */

import { mergeAttributes, Node } from "@tiptap/core";

export type CalloutType = "info" | "warning" | "tip" | "caution";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    callout: {
      setCallout: (attributes: { type?: CalloutType }) => ReturnType;
      toggleCallout: (attributes: { type?: CalloutType }) => ReturnType;
    };
  }
}

export const CalloutExtension = Node.create({
  name: "callout",
  group: "block",
  content: "block+",

  addAttributes() {
    return {
      type: {
        default: "info" as CalloutType,
        parseHTML: (element) =>
          (element.getAttribute("data-callout-type") as CalloutType) ?? "info",
        renderHTML: (attrs) => ({
          "data-callout-type": attrs.type as string,
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-callout-type]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        class: `tiptap-callout tiptap-callout-${HTMLAttributes["data-callout-type"] ?? "info"}`,
      }),
      0,
    ];
  },

  addCommands() {
    return {
      setCallout:
        (attributes) =>
        ({ commands }) =>
          commands.wrapIn(this.name, attributes),
      toggleCallout:
        (attributes) =>
        ({ commands }) =>
          commands.toggleWrap(this.name, attributes),
    };
  },
});
