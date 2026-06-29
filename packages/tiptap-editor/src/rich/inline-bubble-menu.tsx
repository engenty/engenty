/**
 * Floating bubble for inline formatting and link insertion.
 * Uses TipTap BubbleMenu + optional multi-source link search.
 */

import type { Editor } from "@tiptap/core";
import { BubbleMenu, type BubbleMenuProps } from "@tiptap/react/menus";
import {
  type MouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  InlineBubbleMenuCustomItem,
  InlineBubbleMenuLabels,
  InlineBubbleMenuOptions,
  LinkSearchHit,
  LinkSearchSource,
} from "./inline-bubble-types.js";

/** Stable fallbacks so `useEffect(..., [sources])` does not see a new `[]` every render. */
const EMPTY_LINK_SOURCES: LinkSearchSource[] = [];
const EMPTY_CUSTOM_ITEMS: InlineBubbleMenuCustomItem[] = [];

const DEFAULT_LABELS: Required<InlineBubbleMenuLabels> = {
  link: "Link",
  unlink: "Remove link",
  applyUrl: "Apply",
  urlPlaceholder: "https://…",
  searchPlaceholder: "Search pages…",
  noResults: "No matches",
  bold: "Bold",
  italic: "Italic",
  underline: "Underline",
  strike: "Strikethrough",
  code: "Code",
};

function mergeLabels(
  partial?: InlineBubbleMenuLabels
): Required<InlineBubbleMenuLabels> {
  return { ...DEFAULT_LABELS, ...partial };
}

/**
 * If the top field already looks like a URL/path/scheme, do not treat it as an article search term.
 * Plain words (e.g. "antrag") are searched against link sources from the same field.
 */
function looksLikeLinkTarget(s: string): boolean {
  const t = s.trim();
  if (!t) {
    return false;
  }
  if (t.includes("://")) {
    return true;
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(t)) {
    return true;
  }
  if (t.startsWith("/") || t.startsWith("#")) {
    return true;
  }
  if (t.startsWith("..") || t.startsWith("./")) {
    return true;
  }
  return false;
}

/** Keep ProseMirror from stealing mousedown on toolbar buttons; do not block input/textarea focus. */
function bubbleChromeMouseDown(e: MouseEvent<HTMLElement>) {
  const t = e.target as HTMLElement | null;
  if (t?.closest("input, textarea, select")) {
    return;
  }
  e.preventDefault();
}

type BubbleShouldShowArgs = Parameters<
  NonNullable<BubbleMenuProps["shouldShow"]>
>[0];

/** Match TipTap default: keep bubble visible while focus is inside the menu (inputs, etc.). */
function bubbleShouldShowSelection(props: BubbleShouldShowArgs): boolean {
  const { editor, element } = props;
  if (!editor.isEditable) {
    return false;
  }
  const active =
    typeof document === "undefined" ? null : document.activeElement;
  if (active instanceof Node && element.contains(active)) {
    return true;
  }
  const { empty } = editor.state.selection;
  if (empty) {
    return editor.isActive("link");
  }
  return true;
}

function MarkBtn({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      className={`tiptap-inline-bubble__btn ${active ? "is-active" : ""}`}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}

function LinkSearchPanel({
  editor,
  labels,
  sources,
  onClose,
}: {
  editor: Editor;
  labels: Required<InlineBubbleMenuLabels>;
  sources: LinkSearchSource[];
  onClose: () => void;
}) {
  const [url, setUrl] = useState(() => editor.getAttributes("link").href ?? "");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [hits, setHits] = useState<
    Array<LinkSearchHit & { sourceLabel: string }>
  >([]);

  const acRef = useRef<AbortController | null>(null);

  const linkSearchTerm = useMemo(() => {
    const q = query.trim();
    if (q.length >= 2) {
      return q;
    }
    const u = url.trim();
    if (u.length >= 2 && !looksLikeLinkTarget(u)) {
      return u;
    }
    return "";
  }, [query, url]);

  useEffect(() => {
    if (sources.length === 0 || linkSearchTerm.length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }
    acRef.current?.abort();
    const ac = new AbortController();
    acRef.current = ac;
    const timer = setTimeout(() => {
      setLoading(true);
      void (async () => {
        try {
          const batches = await Promise.all(
            sources.map(async (s) => {
              const rows = await s.search(linkSearchTerm, ac.signal);
              return rows.map((h) => ({ ...h, sourceLabel: s.label }));
            })
          );
          if (!ac.signal.aborted) {
            setHits(batches.flat());
          }
        } catch {
          if (!ac.signal.aborted) {
            setHits([]);
          }
        } finally {
          if (!ac.signal.aborted) {
            setLoading(false);
          }
        }
      })();
    }, 220);
    return () => {
      clearTimeout(timer);
      ac.abort();
    };
  }, [linkSearchTerm, sources]);

  const applyHref = useCallback(
    (href: string) => {
      if (!href.trim()) {
        return;
      }
      editor
        .chain()
        .focus()
        .extendMarkRange("link")
        .setLink({ href: href.trim() })
        .run();
      onClose();
    },
    [editor, onClose]
  );

  return (
    <div className="tiptap-inline-bubble__link-panel">
      <div className="tiptap-inline-bubble__link-row">
        <input
          autoComplete="off"
          className="tiptap-inline-bubble__input"
          onChange={(e) => setUrl(e.target.value)}
          placeholder={labels.urlPlaceholder}
          spellCheck={false}
          type="text"
          value={url}
        />
        <button
          className="tiptap-inline-bubble__btn tiptap-inline-bubble__btn--primary"
          onClick={() => applyHref(url)}
          type="button"
        >
          {labels.applyUrl}
        </button>
      </div>
      {sources.length > 0 ? (
        <>
          <input
            autoComplete="off"
            className="tiptap-inline-bubble__input"
            onChange={(e) => setQuery(e.target.value)}
            placeholder={labels.searchPlaceholder}
            spellCheck={false}
            type="search"
            value={query}
          />
          <ul className="tiptap-inline-bubble__hits">
            {linkSearchTerm.length < 2 ? null : loading ? (
              <li className="tiptap-inline-bubble__hit-muted">…</li>
            ) : hits.length === 0 ? (
              <li className="tiptap-inline-bubble__hit-muted">
                {labels.noResults}
              </li>
            ) : (
              hits.map((h) => (
                <li key={`${h.sourceLabel}:${h.id}`}>
                  <button
                    className="tiptap-inline-bubble__hit"
                    onClick={() => applyHref(h.href)}
                    type="button"
                  >
                    <span className="tiptap-inline-bubble__hit-title">
                      {h.title}
                    </span>
                    {h.subtitle ? (
                      <span className="tiptap-inline-bubble__hit-sub">
                        {h.subtitle}
                      </span>
                    ) : null}
                    <span className="tiptap-inline-bubble__hit-src">
                      {h.sourceLabel}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </>
      ) : null}
    </div>
  );
}

export interface RichInlineBubbleMenuProps {
  editor: Editor;
  options?: InlineBubbleMenuOptions | boolean;
}

export function RichInlineBubbleMenu({
  editor,
  options,
}: RichInlineBubbleMenuProps) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkPanelEpoch, setLinkPanelEpoch] = useState(0);

  const resolved = useMemo(() => {
    if (options === false) {
      return null;
    }
    const o: InlineBubbleMenuOptions =
      options === true || options === undefined ? {} : options;
    if (o.enabled === false) {
      return null;
    }
    return o;
  }, [options]);

  const labels = useMemo(
    () => mergeLabels(resolved?.labels),
    [resolved?.labels]
  );

  const sources = useMemo(
    () => resolved?.linkSources ?? EMPTY_LINK_SOURCES,
    [resolved?.linkSources]
  );
  const customItems = useMemo(
    () => resolved?.customItems ?? EMPTY_CUSTOM_ITEMS,
    [resolved?.customItems]
  );

  const shouldShowBubble = useCallback<
    NonNullable<BubbleMenuProps["shouldShow"]>
  >(
    (props) => {
      if (linkOpen) {
        return true;
      }
      return bubbleShouldShowSelection(props);
    },
    [linkOpen]
  );

  if (!resolved) {
    return null;
  }

  return (
    <BubbleMenu
      className="tiptap-inline-bubble"
      editor={editor}
      shouldShow={shouldShowBubble}
      updateDelay={100}
    >
      <div
        className="tiptap-inline-bubble__inner"
        onMouseDown={bubbleChromeMouseDown}
      >
        <div className="tiptap-inline-bubble__marks">
          <MarkBtn
            active={editor.isActive("bold")}
            label={labels.bold}
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            <strong>B</strong>
          </MarkBtn>
          <MarkBtn
            active={editor.isActive("italic")}
            label={labels.italic}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            <em>I</em>
          </MarkBtn>
          <MarkBtn
            active={editor.isActive("underline")}
            label={labels.underline}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
          >
            <span className="tiptap-inline-bubble__u">U</span>
          </MarkBtn>
          <MarkBtn
            active={editor.isActive("strike")}
            label={labels.strike}
            onClick={() => editor.chain().focus().toggleStrike().run()}
          >
            <s>S</s>
          </MarkBtn>
          <MarkBtn
            active={editor.isActive("code")}
            label={labels.code}
            onClick={() => editor.chain().focus().toggleCode().run()}
          >
            <span className="font-mono text-xxs">{"{}"}</span>
          </MarkBtn>
          <span className="tiptap-inline-bubble__sep" />
          <MarkBtn
            active={editor.isActive("link")}
            label={labels.link}
            onClick={() => {
              setLinkOpen((v) => {
                const next = !v;
                if (next) {
                  setLinkPanelEpoch((n) => n + 1);
                }
                return next;
              });
            }}
          >
            🔗
          </MarkBtn>
          {editor.isActive("link") ? (
            <MarkBtn
              active={false}
              label={labels.unlink}
              onClick={() =>
                editor.chain().focus().extendMarkRange("link").unsetLink().run()
              }
            >
              ✕
            </MarkBtn>
          ) : null}
          {customItems.map((item) => (
            <MarkBtn
              active={item.isActive?.(editor) ?? false}
              key={item.id}
              label={item.title}
              onClick={() => item.onClick(editor)}
            >
              <span className="max-w-[2.25rem] truncate font-medium text-xxs">
                {item.title}
              </span>
            </MarkBtn>
          ))}
        </div>
        {linkOpen ? (
          <LinkSearchPanel
            editor={editor}
            key={linkPanelEpoch}
            labels={labels}
            onClose={() => setLinkOpen(false)}
            sources={sources}
          />
        ) : null}
      </div>
    </BubbleMenu>
  );
}
