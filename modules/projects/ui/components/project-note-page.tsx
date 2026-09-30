import { useTranslation } from "@engenty/i18n/ui";
import {
  type JSONContent,
  type LinkSearchSource,
  RichEditorContent,
  type RichEditorLinkClickHandler,
  useRichEditor,
} from "@engenty/tiptap-editor";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ProjectNote, ProjectNoteInput } from "../api.js";

const SAVE_DEBOUNCE_MS = 600;
const EMPTY_DOC: JSONContent = { type: "doc", content: [] };

function isEmptyDoc(json: JSONContent): boolean {
  return !json.content?.some(
    (node) => node.type !== "paragraph" || (node.content?.length ?? 0) > 0
  );
}

interface ProjectNotePageProps {
  autoFocusTitle?: boolean;
  editable: boolean;
  /** Link-field search targets (the project's other pages). */
  linkSources: LinkSearchSource[];
  /** `null` is the empty tab's draft page; its first save creates it. */
  note: ProjectNote | null;
  onLinkClick: RichEditorLinkClickHandler;
  onSave: (noteId: string | null, patch: ProjectNoteInput) => Promise<void>;
}

/**
 * One notes page: a title and the KB page editor (blocks, slash menu,
 * selection bubble). Edits save debounced and flush when the page unmounts,
 * so switching pages never drops the last keystrokes.
 */
export function ProjectNotePage({
  autoFocusTitle = false,
  editable,
  linkSources,
  note,
  onLinkClick,
  onSave,
}: ProjectNotePageProps) {
  const { t } = useTranslation("projects");
  const [title, setTitle] = useState(note?.title ?? "");

  const noteIdRef = useRef(note?.id ?? null);
  noteIdRef.current = note?.id ?? null;
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const pendingRef = useRef<ProjectNoteInput>({});
  const timerRef = useRef<number | null>(null);

  const flush = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const patch = pendingRef.current;
    pendingRef.current = {};
    if (Object.keys(patch).length > 0) {
      void onSaveRef.current(noteIdRef.current, patch);
    }
  }, []);

  const queue = useCallback(
    (patch: ProjectNoteInput) => {
      pendingRef.current = { ...pendingRef.current, ...patch };
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
      timerRef.current = window.setTimeout(flush, SAVE_DEBOUNCE_MS);
    },
    [flush]
  );

  useEffect(() => flush, [flush]);

  const blockMenuLabels = useMemo(
    () => ({
      searchPlaceholder: t("detail.notes.blockMenu.search"),
      transformInto: t("detail.notes.blockMenu.turnInto"),
      paragraph: t("detail.notes.blockMenu.text"),
      heading1: t("detail.notes.blockMenu.heading1"),
      heading2: t("detail.notes.blockMenu.heading2"),
      heading3: t("detail.notes.blockMenu.heading3"),
      bulletList: t("detail.notes.blockMenu.bulletList"),
      orderedList: t("detail.notes.blockMenu.orderedList"),
      blockquote: t("detail.notes.blockMenu.quote"),
      duplicate: t("detail.notes.blockMenu.duplicate"),
      deleteBlock: t("detail.notes.blockMenu.delete"),
      addBlock: t("detail.notes.blockMenu.addBlock"),
      dragHandle: t("detail.notes.blockMenu.dragHandle"),
    }),
    [t]
  );

  const inlineBubbleMenu = useMemo(
    () => ({
      labels: {
        link: t("detail.notes.bubble.link"),
        unlink: t("detail.notes.bubble.unlink"),
        applyUrl: t("detail.notes.bubble.applyUrl"),
        urlPlaceholder: t("detail.notes.bubble.urlPlaceholder"),
        searchPlaceholder: t("detail.notes.bubble.searchPlaceholder"),
        noResults: t("detail.notes.bubble.noResults"),
        bold: t("detail.notes.bubble.bold"),
        italic: t("detail.notes.bubble.italic"),
        underline: t("detail.notes.bubble.underline"),
        strike: t("detail.notes.bubble.strike"),
        code: t("detail.notes.bubble.code"),
      },
      linkSources,
    }),
    [linkSources, t]
  );

  const { editor, editorContentProps } = useRichEditor({
    autoFocus: false,
    blockMenuLabels,
    content: note?.content_json ?? EMPTY_DOC,
    editable,
    inlineBubbleMenu: editable ? inlineBubbleMenu : false,
    onLinkClick,
    onChange: editable
      ? (json, markdown) => {
          const empty = isEmptyDoc(json);
          queue({
            content_json: empty ? null : (json as Record<string, unknown>),
            content_markdown: empty ? null : markdown,
          });
        }
      : undefined,
    placeholder: t("detail.notes.contentPlaceholder"),
  });

  return (
    <article className="min-w-0 space-y-3">
      {editable ? (
        <input
          aria-label={t("detail.notes.titleLabel")}
          autoFocus={autoFocusTitle}
          className="w-full bg-transparent font-semibold text-2xl tracking-tight outline-none placeholder:text-muted-foreground/50"
          onChange={(e) => {
            setTitle(e.target.value);
            queue({ title: e.target.value });
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              editor?.commands.focus("start");
            }
          }}
          placeholder={t("detail.notes.untitled")}
          value={title}
        />
      ) : (
        <h2 className="font-semibold text-2xl tracking-tight">
          {note?.title || t("detail.notes.untitled")}
        </h2>
      )}
      <div className="tiptap-rich-editor flex min-h-[18rem] flex-col">
        {editor ? (
          <RichEditorContent
            className="flex min-h-0 flex-1 flex-col"
            editor={editor}
            editorContentClassName="min-h-[12rem] flex-1"
            {...editorContentProps}
          />
        ) : null}
      </div>
    </article>
  );
}
