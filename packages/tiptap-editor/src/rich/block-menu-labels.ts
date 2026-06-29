export interface BlockMenuLabels {
  addBlock: string;
  blockquote: string;
  bulletList: string;
  deleteBlock: string;
  dragHandle: string;
  duplicate: string;
  heading1: string;
  heading2: string;
  heading3: string;
  orderedList: string;
  paragraph: string;
  searchPlaceholder: string;
  transformInto: string;
}

export const defaultBlockMenuLabels: BlockMenuLabels = {
  searchPlaceholder: "Search actions…",
  transformInto: "Turn into",
  paragraph: "Text",
  heading1: "Heading 1",
  heading2: "Heading 2",
  heading3: "Heading 3",
  bulletList: "Bullet list",
  orderedList: "Numbered list",
  blockquote: "Quote",
  duplicate: "Duplicate",
  deleteBlock: "Delete",
  addBlock: "Add block",
  dragHandle: "Drag to move",
};

export type TransformId =
  | "paragraph"
  | "heading1"
  | "heading2"
  | "heading3"
  | "bulletList"
  | "orderedList"
  | "blockquote";

export const blockTransformItems: {
  id: TransformId;
  labelKey: keyof BlockMenuLabels;
}[] = [
  { id: "paragraph", labelKey: "paragraph" },
  { id: "heading1", labelKey: "heading1" },
  { id: "heading2", labelKey: "heading2" },
  { id: "heading3", labelKey: "heading3" },
  { id: "bulletList", labelKey: "bulletList" },
  { id: "orderedList", labelKey: "orderedList" },
  { id: "blockquote", labelKey: "blockquote" },
];
