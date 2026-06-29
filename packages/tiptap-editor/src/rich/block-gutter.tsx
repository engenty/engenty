/**
 * Notion-style block gutter: + insert, drag handle, and block menu.
 */

import type { Editor } from "@tiptap/core";
import type {
  DragEvent as ReactDragEvent,
  MouseEvent as ReactMouseEvent,
} from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type BlockMenuLabels,
  defaultBlockMenuLabels,
} from "./block-menu-labels.js";

export type { BlockMenuLabels } from "./block-menu-labels.js";

import { BlockMenuPanel } from "./block-menu-panel.jsx";
import {
  BLOCK_DRAG_MIME,
  type BlockRange,
  moveBlockSlice,
  resolveBlockAtPos,
} from "./block-utils.js";

export function BlockGutter({
  editor,
  labels: labelsProp,
}: {
  editor: Editor;
  labels?: Partial<BlockMenuLabels>;
}) {
  const labels = { ...defaultBlockMenuLabels, ...labelsProp };
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const gripPointerRef = useRef<{ x: number; y: number } | null>(null);
  /** Suppress hover tracking while the user is dragging a text selection. */
  const isTextSelectingRef = useRef(false);
  /** True between block-drag dragstart and dragend.
   *  Used instead of dataTransfer.types because some browsers (notably Safari)
   *  hide custom MIME types from `types` during dragover events. */
  const blockDragActiveRef = useRef(false);
  /** Snapped drop position computed during dragover; consumed on drop. */
  const dropTargetRef = useRef<{ insertPos: number } | null>(null);
  const [hoveredBlock, setHoveredBlock] = useState<BlockRange | null>(null);
  const [selectionBlock, setSelectionBlock] = useState<BlockRange | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuQuery, setMenuQuery] = useState("");
  const [gutterTop, setGutterTop] = useState(0);
  const [dropIndicatorTop, setDropIndicatorTop] = useState<number | null>(null);
  const [menuPos, setMenuPos] = useState<{ left: number; top: number } | null>(
    null
  );

  const activeBlock = hoveredBlock ?? selectionBlock;

  const syncSelectionBlock = useCallback(() => {
    if (!editor) {
      return;
    }
    const block = resolveBlockAtPos(
      editor.state.doc,
      editor.state.selection.from
    );
    setSelectionBlock(block);
  }, [editor]);

  useEffect(() => {
    if (!editor) {
      return;
    }
    syncSelectionBlock();
    const onSel = () => syncSelectionBlock();
    const onUpdate = () => syncSelectionBlock();
    editor.on("selectionUpdate", onSel);
    editor.on("transaction", onUpdate);
    return () => {
      editor.off("selectionUpdate", onSel);
      editor.off("transaction", onUpdate);
    };
  }, [editor, syncSelectionBlock]);

  useEffect(() => {
    if (!editor?.isEditable) {
      return;
    }
    const dom = editor.view.dom;
    /** Pixels to the left of the editor that still count as "hovering a block" — covers the gutter strip. */
    const GUTTER_HOVER_PAD_PX = 64;

    /** Track left-button drags so we don't fight ProseMirror's text selection. */
    const onDown = (e: Event) => {
      const me = e as globalThis.MouseEvent;
      if (me.button !== 0) {
        return;
      }
      isTextSelectingRef.current = true;
    };

    const onUpDoc = () => {
      isTextSelectingRef.current = false;
    };

    const onMoveDoc = (e: globalThis.MouseEvent) => {
      if (menuOpen || isTextSelectingRef.current) {
        return;
      }
      const r = dom.getBoundingClientRect();
      const inZone =
        e.clientX >= r.left - GUTTER_HOVER_PAD_PX &&
        e.clientX <= r.right &&
        e.clientY >= r.top &&
        e.clientY <= r.bottom;
      if (!inZone) {
        setHoveredBlock(null);
        return;
      }
      // Clamp X to inside the editor so posAtCoords works when the cursor
      // is in the gutter strip (which has no editor content under it).
      const probeX = Math.max(e.clientX, r.left + 8);
      const coords = editor.view.posAtCoords({
        left: probeX,
        top: e.clientY,
      });
      if (!coords) {
        setHoveredBlock(null);
        return;
      }
      setHoveredBlock(resolveBlockAtPos(editor.state.doc, coords.pos));
    };

    dom.addEventListener("mousedown", onDown);
    document.addEventListener("mousemove", onMoveDoc);
    document.addEventListener("mouseup", onUpDoc);
    return () => {
      dom.removeEventListener("mousedown", onDown);
      document.removeEventListener("mousemove", onMoveDoc);
      document.removeEventListener("mouseup", onUpDoc);
    };
  }, [editor, menuOpen]);

  useEffect(() => {
    if (!editor?.isEditable) {
      return;
    }
    const dom = editor.view.dom;

    const computeSnap = (clientX: number, clientY: number) => {
      const coords = editor.view.posAtCoords({ left: clientX, top: clientY });
      if (!coords) {
        return null;
      }
      const block = resolveBlockAtPos(editor.state.doc, coords.pos);
      if (!block) {
        return null;
      }
      // Use inner positions (block.from is BEFORE the node, +1 lands inside)
      const top = editor.view.coordsAtPos(block.from + 1).top;
      const bottom = editor.view.coordsAtPos(
        Math.max(block.from + 1, block.to - 1)
      ).bottom;
      const insertAbove = clientY < (top + bottom) / 2;
      return {
        insertPos: insertAbove ? block.from : block.to,
        indicatorClientY: insertAbove ? top : bottom,
      };
    };

    const onDragEnter = (e: Event) => {
      if (!blockDragActiveRef.current) {
        return;
      }
      e.preventDefault();
    };

    const onDragOver = (e: Event) => {
      if (!blockDragActiveRef.current) {
        return;
      }
      const de = e as globalThis.DragEvent;
      de.preventDefault();
      if (de.dataTransfer) {
        de.dataTransfer.dropEffect = "move";
      }
      const snap = computeSnap(de.clientX, de.clientY);
      if (!snap) {
        dropTargetRef.current = null;
        setDropIndicatorTop(null);
        return;
      }
      dropTargetRef.current = { insertPos: snap.insertPos };
      const chrome = wrapRef.current?.closest(".tiptap-editor-chrome");
      if (chrome) {
        const r = chrome.getBoundingClientRect();
        setDropIndicatorTop(snap.indicatorClientY - r.top);
      }
    };

    const onDrop = (e: Event) => {
      if (!blockDragActiveRef.current) {
        return;
      }
      const de = e as globalThis.DragEvent;
      const raw = de.dataTransfer?.getData(BLOCK_DRAG_MIME);
      de.preventDefault();
      let payload: { from: number; to: number } | null = null;
      if (raw) {
        try {
          payload = JSON.parse(raw) as { from: number; to: number };
        } catch {
          payload = null;
        }
      }
      const target =
        dropTargetRef.current ??
        (() => {
          const snap = computeSnap(de.clientX, de.clientY);
          return snap ? { insertPos: snap.insertPos } : null;
        })();
      dropTargetRef.current = null;
      setDropIndicatorTop(null);
      blockDragActiveRef.current = false;
      if (!(payload && target)) {
        return;
      }
      moveBlockSlice(editor, payload.from, payload.to, target.insertPos);
    };

    const onDragLeave = (e: Event) => {
      const de = e as globalThis.DragEvent;
      if (!(de.relatedTarget && dom.contains(de.relatedTarget as Node))) {
        setDropIndicatorTop(null);
      }
    };

    dom.addEventListener("dragenter", onDragEnter);
    dom.addEventListener("dragover", onDragOver);
    dom.addEventListener("drop", onDrop);
    dom.addEventListener("dragleave", onDragLeave);
    return () => {
      dom.removeEventListener("dragenter", onDragEnter);
      dom.removeEventListener("dragover", onDragOver);
      dom.removeEventListener("drop", onDrop);
      dom.removeEventListener("dragleave", onDragLeave);
    };
  }, [editor]);

  useEffect(() => {
    if (!menuOpen) {
      setMenuPos(null);
    }
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        setMenuQuery("");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  useEffect(() => {
    if (!(menuOpen && menuRef.current)) {
      return;
    }
    const input = menuRef.current.querySelector("input");
    input?.focus();
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    const onDocMouseDown = (e: Event) => {
      const t = (e as globalThis.MouseEvent).target as Node;
      if (menuRef.current?.contains(t)) {
        return;
      }
      if (wrapRef.current?.contains(t)) {
        return;
      }
      setMenuOpen(false);
      setMenuQuery("");
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [menuOpen]);

  useEffect(() => {
    if (!(activeBlock && wrapRef.current && editor)) {
      return;
    }
    const chrome = wrapRef.current.closest(".tiptap-editor-chrome");
    if (!chrome) {
      return;
    }
    // Center the gutter on the first line of the block so it visually aligns
    // with the text baseline of headings and paragraphs alike.
    const inside = Math.min(
      activeBlock.from + 1,
      Math.max(activeBlock.from + 1, activeBlock.to - 1)
    );
    const lineCoords = editor.view.coordsAtPos(inside);
    const lineCenter = (lineCoords.top + lineCoords.bottom) / 2;
    const chromeRect = chrome.getBoundingClientRect();
    const GUTTER_HEIGHT = 24; // matches CSS height: 1.5rem
    setGutterTop(lineCenter - chromeRect.top - GUTTER_HEIGHT / 2);
  }, [activeBlock, editor, editor?.state]);

  if (!editor.isEditable) {
    return null;
  }

  const openMenu = () => {
    if (!(activeBlock && wrapRef.current)) {
      return;
    }
    const r = wrapRef.current.getBoundingClientRect();
    setMenuPos({ left: r.left, top: r.bottom + 4 });
    setMenuOpen(true);
    setMenuQuery("");
  };

  const onAddClick = (e: ReactMouseEvent) => {
    e.preventDefault();
    if (!activeBlock) {
      return;
    }
    editor
      .chain()
      .focus()
      .insertContentAt(activeBlock.to, { type: "paragraph" })
      .run();
  };

  const onDragStart = (e: ReactDragEvent<HTMLButtonElement>) => {
    if (!activeBlock) {
      return;
    }
    blockDragActiveRef.current = true;
    e.dataTransfer.setData(
      BLOCK_DRAG_MIME,
      JSON.stringify({ from: activeBlock.from, to: activeBlock.to })
    );
    e.dataTransfer.effectAllowed = "move";

    // Build a small floating preview rather than the full block DOM, so the
    // ghost never covers the drop indicator line. Anchor the cursor at the
    // left edge so the preview floats to the RIGHT of the cursor.
    if (typeof e.dataTransfer.setDragImage === "function") {
      const node = editor.view.nodeDOM(activeBlock.from) as HTMLElement | null;
      const text = node?.textContent?.trim() ?? "";
      const preview = document.createElement("div");
      preview.className = "tiptap-block-drag-preview";
      preview.textContent = text || activeBlock.node.type.name;
      document.body.appendChild(preview);
      const previewRect = preview.getBoundingClientRect();
      // Cursor at left edge, vertically centered → preview sits to the
      // RIGHT of the cursor and never sits over the indicator line.
      e.dataTransfer.setDragImage(preview, 0, previewRect.height / 2);
      // Browser captures pixels synchronously; remove on next frame.
      requestAnimationFrame(() => {
        preview.remove();
      });
    }
  };

  const onDragEnd = () => {
    blockDragActiveRef.current = false;
    dropTargetRef.current = null;
    setDropIndicatorTop(null);
  };

  const showGutter = activeBlock !== null;
  const blockForMenu = activeBlock;

  return (
    <>
      <div
        aria-hidden={!showGutter}
        className={`tiptap-block-gutter ${showGutter ? "is-visible" : ""}`}
        ref={wrapRef}
        style={{ top: gutterTop }}
      >
        <button
          className="tiptap-block-gutter-btn"
          onClick={onAddClick}
          onMouseDown={(e) => e.preventDefault()}
          title={labels.addBlock}
          type="button"
        >
          +
        </button>
        <button
          className="tiptap-block-gutter-btn tiptap-block-gutter-drag"
          draggable
          onClick={(e) => {
            const p = gripPointerRef.current;
            if (
              p &&
              (Math.abs(e.clientX - p.x) > 6 || Math.abs(e.clientY - p.y) > 6)
            ) {
              return;
            }
            openMenu();
          }}
          onDragEnd={onDragEnd}
          onDragStart={onDragStart}
          onPointerDown={(e) => {
            gripPointerRef.current = { x: e.clientX, y: e.clientY };
            if (activeBlock) {
              setSelectionBlock(activeBlock);
            }
          }}
          title={labels.dragHandle}
          type="button"
        >
          <svg
            aria-hidden
            className="tiptap-block-grip-svg"
            height="14"
            viewBox="0 0 10 14"
            width="10"
          >
            <title>{labels.dragHandle}</title>
            <circle cx="2.5" cy="2.5" fill="currentColor" r="1.25" />
            <circle cx="7.5" cy="2.5" fill="currentColor" r="1.25" />
            <circle cx="2.5" cy="7" fill="currentColor" r="1.25" />
            <circle cx="7.5" cy="7" fill="currentColor" r="1.25" />
            <circle cx="2.5" cy="11.5" fill="currentColor" r="1.25" />
            <circle cx="7.5" cy="11.5" fill="currentColor" r="1.25" />
          </svg>
        </button>
      </div>

      {dropIndicatorTop === null ? null : (
        <div
          aria-hidden
          className="tiptap-block-drop-indicator"
          style={{ top: dropIndicatorTop }}
        />
      )}

      {menuOpen && blockForMenu && menuPos ? (
        <BlockMenuPanel
          block={blockForMenu}
          editor={editor}
          labels={labels}
          menuPos={menuPos}
          menuQuery={menuQuery}
          menuRef={menuRef}
          onAfterAction={() => {
            setMenuOpen(false);
            setMenuQuery("");
          }}
          setMenuQuery={setMenuQuery}
        />
      ) : null}
    </>
  );
}
