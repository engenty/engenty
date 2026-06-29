import type { Editor } from "@tiptap/core";
import type { ReactNode, RefObject } from "react";
import {
  type BlockMenuLabels,
  blockTransformItems,
  type TransformId,
} from "./block-menu-labels.js";
import {
  deleteBlock,
  duplicateBlock,
  transformBlock,
} from "./block-transform.js";
import type { BlockRange } from "./block-utils.js";

/* ── Icons ── */

function IconBadge({ children }: { children: ReactNode }) {
  return <span className="tiptap-block-menu-icon">{children}</span>;
}

const transformIcons: Record<TransformId, ReactNode> = {
  paragraph: <span className="tiptap-block-menu-glyph">¶</span>,
  heading1: <span className="tiptap-block-menu-glyph">H1</span>,
  heading2: <span className="tiptap-block-menu-glyph">H2</span>,
  heading3: <span className="tiptap-block-menu-glyph">H3</span>,
  bulletList: (
    <svg
      aria-hidden
      fill="none"
      height="14"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.6"
      viewBox="0 0 16 16"
      width="14"
    >
      <title>Bullet list</title>
      <circle cx="3" cy="4" fill="currentColor" r="1.1" />
      <circle cx="3" cy="8" fill="currentColor" r="1.1" />
      <circle cx="3" cy="12" fill="currentColor" r="1.1" />
      <line x1="6.5" x2="13.5" y1="4" y2="4" />
      <line x1="6.5" x2="13.5" y1="8" y2="8" />
      <line x1="6.5" x2="13.5" y1="12" y2="12" />
    </svg>
  ),
  orderedList: (
    <svg
      aria-hidden
      fill="none"
      height="14"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.6"
      viewBox="0 0 16 16"
      width="14"
    >
      <title>Numbered list</title>
      <text fill="currentColor" fontSize="4.5" stroke="none" x="0.6" y="5.4">
        1.
      </text>
      <text fill="currentColor" fontSize="4.5" stroke="none" x="0.6" y="9.6">
        2.
      </text>
      <text fill="currentColor" fontSize="4.5" stroke="none" x="0.6" y="13.8">
        3.
      </text>
      <line x1="6.5" x2="13.5" y1="4" y2="4" />
      <line x1="6.5" x2="13.5" y1="8" y2="8" />
      <line x1="6.5" x2="13.5" y1="12" y2="12" />
    </svg>
  ),
  blockquote: (
    <svg
      aria-hidden
      fill="currentColor"
      height="14"
      viewBox="0 0 16 16"
      width="14"
    >
      <title>Quote</title>
      <path d="M3 4h3v3.2c0 1.7-1.1 3.1-2.7 3.5l-.3-.9c.9-.3 1.5-1 1.5-1.9H3V4zm6 0h3v3.2c0 1.7-1.1 3.1-2.7 3.5l-.3-.9c.9-.3 1.5-1 1.5-1.9H9V4z" />
    </svg>
  ),
};

const duplicateIcon = (
  <svg
    aria-hidden
    fill="none"
    height="14"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="1.6"
    viewBox="0 0 16 16"
    width="14"
  >
    <title>Duplicate block</title>
    <rect height="9" rx="1.5" width="9" x="5" y="5" />
    <path d="M3 11V4.5C3 3.7 3.7 3 4.5 3H11" />
  </svg>
);

const deleteIcon = (
  <svg
    aria-hidden
    fill="none"
    height="14"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="1.6"
    viewBox="0 0 16 16"
    width="14"
  >
    <title>Delete block</title>
    <line x1="2.5" x2="13.5" y1="4" y2="4" />
    <path d="M5 4V2.5C5 2.2 5.2 2 5.5 2h5c.3 0 .5.2.5.5V4" />
    <path d="M4 4l1 9c0 .6.4 1 1 1h4c.6 0 1-.4 1-1l1-9" />
  </svg>
);

/* ── Component ── */

export function BlockMenuPanel({
  block,
  editor,
  labels,
  menuPos,
  menuQuery,
  menuRef,
  setMenuQuery,
  onAfterAction,
}: {
  editor: Editor;
  block: BlockRange;
  labels: BlockMenuLabels;
  menuPos: { left: number; top: number };
  menuQuery: string;
  setMenuQuery: (q: string) => void;
  menuRef: RefObject<HTMLDivElement | null>;
  onAfterAction: () => void;
}) {
  const q = menuQuery.trim().toLowerCase();
  const filteredTransforms = blockTransformItems.filter((item) => {
    if (!q) {
      return true;
    }
    return (
      labels[item.labelKey].toLowerCase().includes(q) || item.id.includes(q)
    );
  });
  const showActions =
    !q ||
    labels.duplicate.toLowerCase().includes(q) ||
    labels.deleteBlock.toLowerCase().includes(q);

  return (
    <div
      className="tiptap-block-menu"
      ref={menuRef}
      style={{
        left: menuPos.left,
        position: "fixed",
        top: menuPos.top,
        zIndex: 10_000,
      }}
    >
      <input
        aria-label={labels.searchPlaceholder}
        className="tiptap-block-menu-search"
        onChange={(e) => setMenuQuery(e.target.value)}
        placeholder={labels.searchPlaceholder}
        type="search"
        value={menuQuery}
      />

      {filteredTransforms.length > 0 ? (
        <div className="tiptap-block-menu-group">
          <div className="tiptap-block-menu-label">{labels.transformInto}</div>
          {filteredTransforms.map((item) => (
            <button
              className="tiptap-block-menu-item"
              key={item.id}
              onClick={() => {
                transformBlock(editor, block, item.id);
                onAfterAction();
              }}
              type="button"
            >
              <IconBadge>{transformIcons[item.id]}</IconBadge>
              <span className="tiptap-block-menu-item-label">
                {labels[item.labelKey]}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {filteredTransforms.length > 0 && showActions ? (
        <div className="tiptap-block-menu-divider" />
      ) : null}

      {showActions ? (
        <div className="tiptap-block-menu-group">
          <button
            className="tiptap-block-menu-item"
            onClick={() => {
              duplicateBlock(editor, block);
              onAfterAction();
            }}
            type="button"
          >
            <IconBadge>{duplicateIcon}</IconBadge>
            <span className="tiptap-block-menu-item-label">
              {labels.duplicate}
            </span>
          </button>
          <button
            className="tiptap-block-menu-item tiptap-block-menu-item-danger"
            onClick={() => {
              deleteBlock(editor, block);
              onAfterAction();
            }}
            type="button"
          >
            <IconBadge>{deleteIcon}</IconBadge>
            <span className="tiptap-block-menu-item-label">
              {labels.deleteBlock}
            </span>
          </button>
        </div>
      ) : null}

      {filteredTransforms.length === 0 && !showActions ? (
        <div className="tiptap-block-menu-empty">
          {labels.searchPlaceholder}
        </div>
      ) : null}
    </div>
  );
}
