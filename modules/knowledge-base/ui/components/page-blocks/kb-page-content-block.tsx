/**
 * Inline-editable TipTap content block inside a page block list.
 */

import { useTranslation } from "@engenty/i18n/ui";
import type {
  Editor,
  InlineBubbleMenuOptions,
  JSONContent,
} from "@engenty/tiptap-editor";
import {
  RichEditor,
  RichEditorContent,
  useRichEditor,
} from "@engenty/tiptap-editor";
import "@engenty/tiptap-editor/styles.css";
import { cn } from "@engenty/ui-core";
import { Pencil } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { KbPageContentBlock } from "../../../src/schema/page-blocks.js";
import { createKbArticleLinkBubbleSources } from "../../lib/kb-article-inline-link-sources.js";
import { createKbModuleRichEditorLinkHandler } from "../../lib/kb-rich-editor-link-navigation.js";
import { jsonIsEmptyDoc } from "../../lib/page-blocks/page-block-empty.js";
import { useKbsQuery } from "../../queries.js";
import "../../category-rich-block.css";

const SAVE_DEBOUNCE_MS = 600;

/** Strip inline min-height set by TipTap/ProseMirror inside page content blocks only. */
function clearPageContentBlockInlineMinHeights(editor: Editor) {
  const boundary = editor.view.dom.closest(".kb-page-content-block");
  if (!boundary) {
    return;
  }
  let el: HTMLElement | null = editor.view.dom;
  while (el && boundary.contains(el)) {
    el.style.removeProperty("min-height");
    if (el === boundary) {
      break;
    }
    el = el.parentElement;
  }
}

interface KbPageContentBlockViewProps {
  block: KbPageContentBlock;
  editable?: boolean;
  kbId: string;
  onChange: (patch: {
    content_json: Record<string, unknown> | null;
    content_markdown: string | null;
  }) => void;
  placeholder: string;
}

export function KbPageContentBlockView({
  block,
  editable = false,
  kbId,
  onChange,
  placeholder,
}: KbPageContentBlockViewProps) {
  const { t, i18n } = useTranslation("kb");
  const navigate = useNavigate();
  const { data: kbsRaw } = useKbsQuery();
  const kbs = Array.isArray(kbsRaw) ? kbsRaw : [];

  const initialJson = block.content_json as JSONContent | null;
  const lastSavedJsonRef = useRef<string>(JSON.stringify(initialJson ?? null));
  const saveTimerRef = useRef<number | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [currentJson, setCurrentJson] = useState<JSONContent | null>(
    initialJson ?? null
  );

  useEffect(() => {
    setCurrentJson(initialJson ?? null);
    lastSavedJsonRef.current = JSON.stringify(initialJson ?? null);
  }, [initialJson]);

  useEffect(
    () => () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
      }
    },
    []
  );

  const persistChange = useMemo(
    () => (json: JSONContent, markdown: string) => {
      setCurrentJson(json);
      const serialized = JSON.stringify(json);
      if (serialized === lastSavedJsonRef.current) {
        return;
      }
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
      }
      saveTimerRef.current = window.setTimeout(() => {
        lastSavedJsonRef.current = serialized;
        const cleared = jsonIsEmptyDoc(json);
        onChange({
          content_json: cleared ? null : (json as Record<string, unknown>),
          content_markdown: cleared ? null : markdown,
        });
      }, SAVE_DEBOUNCE_MS);
    },
    [onChange]
  );

  const blockMenuLabels = useMemo(
    () => ({
      searchPlaceholder: t("article.block_menu.search"),
      transformInto: t("article.block_menu.turn_into"),
      paragraph: t("article.block_menu.text"),
      heading1: t("article.block_menu.heading1"),
      heading2: t("article.block_menu.heading2"),
      heading3: t("article.block_menu.heading3"),
      bulletList: t("article.block_menu.bullet_list"),
      orderedList: t("article.block_menu.ordered_list"),
      blockquote: t("article.block_menu.quote"),
      duplicate: t("article.block_menu.duplicate"),
      deleteBlock: t("article.block_menu.delete"),
      addBlock: t("article.block_menu.add_block"),
      dragHandle: t("article.block_menu.drag_handle"),
    }),
    [t]
  );

  const inlineBubbleMenu = useMemo((): InlineBubbleMenuOptions => {
    const labels: InlineBubbleMenuOptions["labels"] = {
      link: t("article.bubble.link"),
      unlink: t("article.bubble.unlink"),
      applyUrl: t("article.bubble.apply_url"),
      urlPlaceholder: t("article.bubble.url_placeholder"),
      searchPlaceholder: t("article.bubble.search_placeholder"),
      noResults: t("article.bubble.no_results"),
      bold: t("article.bubble.bold"),
      italic: t("article.bubble.italic"),
      underline: t("article.bubble.underline"),
      strike: t("article.bubble.strike"),
      code: t("article.bubble.code"),
    };
    if (!kbId) {
      return { labels, linkSources: [] };
    }
    return {
      labels,
      linkSources: createKbArticleLinkBubbleSources({
        kbs,
        currentKbId: kbId,
        labels: {
          thisKb: t("article.bubble.link_source_this_kb"),
          otherKbs: t("article.bubble.link_source_other_kbs"),
        },
      }),
    };
  }, [kbId, kbs, i18n.language]);

  const onRichEditorLinkClick = useMemo(
    () => createKbModuleRichEditorLinkHandler(navigate),
    [navigate]
  );

  const { editor, editorContentProps } = useRichEditor({
    autoFocus: false,
    blockMenuLabels,
    content: currentJson ?? { type: "doc", content: [] },
    editable,
    inlineBubbleMenu: editable ? inlineBubbleMenu : false,
    onLinkClick: editable ? onRichEditorLinkClick : undefined,
    onChange: editable ? persistChange : undefined,
    placeholder,
  });

  const hydratedBlockIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!editor) {
      return;
    }
    if (hydratedBlockIdRef.current === block.id) {
      return;
    }
    hydratedBlockIdRef.current = block.id;
    const next = initialJson ?? { type: "doc", content: [] };
    editor.commands.setContent(next, { emitUpdate: false });
    setCurrentJson(initialJson ?? null);
  }, [block.id, editor, initialJson]);

  useEffect(() => {
    if (!editor) {
      return;
    }
    const sync = () => clearPageContentBlockInlineMinHeights(editor);
    sync();
    editor.on("create", sync);
    editor.on("update", sync);
    editor.on("transaction", sync);
    return () => {
      editor.off("create", sync);
      editor.off("update", sync);
      editor.off("transaction", sync);
    };
  }, [editor]);

  const isEmpty = jsonIsEmptyDoc(currentJson as Record<string, unknown> | null);
  const showEmptyChrome = editable && isEmpty && !isFocused;
  const isEditingEmpty = editable && isEmpty && isFocused;

  if (!editable && isEmpty) {
    return null;
  }

  if (!editable) {
    return (
      <div className="kb-page-content-block">
        <RichEditor
          className="category-rich-editor"
          content={currentJson ?? { type: "doc", content: [] }}
          editable={false}
          editorContentClassName="min-h-0"
          key={block.id}
          showBlockChrome={false}
          showToolbar={false}
          slashCommands={false}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "kb-page-content-block category-rich-block group/cat-rich relative rounded-md pt-0 transition-colors focus-within:bg-muted/40 hover:bg-muted/40",
        showEmptyChrome &&
          "category-rich-block--compact border border-muted-foreground/30 border-dashed bg-muted/20 pb-1.5 text-muted-foreground hover:border-muted-foreground/50",
        isEditingEmpty && "category-rich-block--editing"
      )}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setIsFocused(false);
        }
      }}
      onFocus={() => setIsFocused(true)}
    >
      {showEmptyChrome ? (
        <Pencil
          aria-hidden
          className="pointer-events-none absolute top-1.5 right-2 h-3.5 w-3.5 text-muted-foreground/50 opacity-0 transition-opacity group-hover/cat-rich:opacity-100"
        />
      ) : null}
      <div className="tiptap-rich-editor flex flex-col pr-24">
        {editor ? (
          <RichEditorContent
            className="category-rich-editor flex flex-col"
            editor={editor}
            {...editorContentProps}
          />
        ) : null}
      </div>
    </div>
  );
}
