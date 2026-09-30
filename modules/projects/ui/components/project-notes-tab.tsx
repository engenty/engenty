import { useTranslation } from "@engenty/i18n/ui";
import type {
  LinkSearchSource,
  RichEditorLinkClickHandler,
} from "@engenty/tiptap-editor";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  cn,
  DocSidebarLayout,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Skeleton,
} from "@engenty/ui-core";
import { FileText, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { type ReactNode, useCallback, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import type { ProjectNote, ProjectNoteInput } from "../api.js";
import { PROJECT_NOTES_SIDEBAR_KEY } from "../lib/project-settings-sidebar.js";
import {
  useCreateProjectNoteMutation,
  useDeleteProjectNoteMutation,
  useProjectNotesQuery,
  useUpdateProjectNoteMutation,
} from "../project-notes-queries.js";
import { ProjectNotePage } from "./project-note-page.js";

/** Search param holding the open page; absent = the first page. */
const NOTE_PARAM = "note";

interface ProjectNotesTabProps {
  /** Inset the page like the title inside the cover band. */
  alignToCover: boolean;
  /** Row width and padding, as the page gives its other tabs. */
  className?: string;
  editable: boolean;
  projectId: string;
}

/** In-app links (other note pages) navigate in place; the rest open normally. */
const navigateInApp =
  (navigate: ReturnType<typeof useNavigate>): RichEditorLinkClickHandler =>
  (href, event) => {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return false;
    }
    const url = new URL(href, window.location.href);
    if (url.origin !== window.location.origin) {
      return false;
    }
    navigate(`${url.pathname}${url.search}${url.hash}`);
    return true;
  };

/**
 * The Notes tab: the open page, with the project's pages in its doc sidebar
 * (open/closable like the overview's settings sidebar).
 */
export function ProjectNotesTab({
  alignToCover,
  className,
  editable,
  projectId,
}: ProjectNotesTabProps) {
  const { t } = useTranslation("projects");
  const notesQuery = useProjectNotesQuery(projectId);
  const notes = notesQuery.data ?? [];
  const createMutation = useCreateProjectNoteMutation(projectId);
  const updateMutation = useUpdateProjectNoteMutation(projectId);
  const deleteMutation = useDeleteProjectNoteMutation(projectId);

  const [searchParams, setSearchParams] = useSearchParams();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const onLinkClick = useMemo(() => navigateInApp(navigate), [navigate]);

  // Wiki-style links: the link field searches this project's pages by title.
  const notesRef = useRef(notes);
  notesRef.current = notes;
  const linkSources = useMemo<LinkSearchSource[]>(
    () => [
      {
        id: "project-notes",
        label: t("detail.notes.pages"),
        search: (query) => {
          const q = query.trim().toLowerCase();
          return Promise.resolve(
            notesRef.current
              .filter((n) => n.title.toLowerCase().includes(q))
              .map((n) => ({
                id: n.id,
                title: n.title,
                href: `${pathname}?tab=notes&${NOTE_PARAM}=${n.id}`,
              }))
          );
        },
      },
    ],
    [pathname, t]
  );
  const activeNote =
    notes.find((n) => n.id === searchParams.get(NOTE_PARAM)) ??
    notes[0] ??
    null;

  const selectNote = useCallback(
    (noteId: string | null) =>
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (noteId) {
            next.set(NOTE_PARAM, noteId);
          } else {
            next.delete(NOTE_PARAM);
          }
          return next;
        },
        { replace: true }
      ),
    [setSearchParams]
  );

  // With no pages yet the tab opens a draft page. Its first save creates the
  // note; the page keeps its React key across that so the editor (and the
  // caret) stays put, and saves racing the create wait for it.
  const [draft, setDraft] = useState<{ key: number; noteId: string | null }>({
    key: 0,
    noteId: null,
  });
  const pendingCreateRef = useRef<Promise<ProjectNote> | null>(null);
  const [focusTitleOf, setFocusTitleOf] = useState<string | null>(null);
  const [noteToDelete, setNoteToDelete] = useState<ProjectNote | null>(null);

  const save = useCallback(
    async (noteId: string | null, patch: ProjectNoteInput) => {
      if (noteId) {
        await updateMutation.mutateAsync({ noteId, patch });
        return;
      }
      if (pendingCreateRef.current) {
        const created = await pendingCreateRef.current;
        await updateMutation.mutateAsync({ noteId: created.id, patch });
        return;
      }
      pendingCreateRef.current = createMutation.mutateAsync(patch);
      const created = await pendingCreateRef.current;
      setDraft((d) => ({ ...d, noteId: created.id }));
      selectNote(created.id);
    },
    [createMutation, selectNote, updateMutation]
  );

  const addPage = async () => {
    const created = await createMutation.mutateAsync({});
    setFocusTitleOf(created.id);
    selectNote(created.id);
  };

  const confirmDelete = () => {
    const target = noteToDelete;
    setNoteToDelete(null);
    if (!target) {
      return;
    }
    if (target.id === activeNote?.id) {
      const index = notes.findIndex((n) => n.id === target.id);
      const neighbour = notes[index + 1] ?? notes[index - 1] ?? null;
      selectNote(neighbour?.id ?? null);
    }
    if (target.id === draft.noteId) {
      pendingCreateRef.current = null;
      setDraft((d) => ({ key: d.key + 1, noteId: null }));
    }
    deleteMutation.mutate(target.id);
  };

  const pageKey =
    activeNote && activeNote.id !== draft.noteId
      ? activeNote.id
      : `draft-${draft.key}`;

  const pageList = notesQuery.isPending ? (
    <div className="space-y-2">
      <Skeleton className="h-6 w-full" />
      <Skeleton className="h-6 w-2/3" />
    </div>
  ) : (
    <nav aria-label={t("detail.notes.pages")} className="flex flex-col gap-0.5">
      {notes.map((note) => (
        <div
          className={cn(
            "group/note flex items-center rounded-md text-sm transition-colors hover:bg-muted/60",
            note.id === activeNote?.id && "bg-muted font-medium"
          )}
          key={note.id}
        >
          <button
            className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left"
            onClick={() => selectNote(note.id)}
            type="button"
          >
            <FileText className="size-3.5 shrink-0 text-muted-foreground" />
            <span
              className={cn("truncate", !note.title && "text-muted-foreground")}
            >
              {note.title || t("detail.notes.untitled")}
            </span>
          </button>
          {editable ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  aria-label={t("detail.notes.pageActions")}
                  className="mr-1 size-6 opacity-0 group-hover/note:opacity-100 data-[state=open]:opacity-100"
                  size="icon"
                  variant="ghost"
                >
                  <MoreHorizontal className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => setNoteToDelete(note)}
                >
                  <Trash2 className="mr-2 size-4" />
                  {t("detail.notes.deletePage")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      ))}
      {editable ? (
        <button
          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-muted-foreground text-sm transition-colors hover:bg-muted/60 hover:text-foreground disabled:opacity-50"
          disabled={createMutation.isPending}
          onClick={() => void addPage()}
          type="button"
        >
          <Plus className="size-3.5" />
          {t("detail.notes.newPage")}
        </button>
      ) : null}
      {notes.length === 0 && !editable ? (
        <p className="px-2 text-muted-foreground text-sm">
          {t("detail.notes.empty")}
        </p>
      ) : null}
    </nav>
  );

  let body: ReactNode = null;
  if (notesQuery.isPending) {
    body = (
      <div className="space-y-3">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  } else if (editable || activeNote) {
    body = (
      <ProjectNotePage
        autoFocusTitle={activeNote !== null && activeNote.id === focusTitleOf}
        editable={editable}
        key={pageKey}
        linkSources={linkSources}
        note={activeNote}
        onLinkClick={onLinkClick}
        onSave={save}
      />
    );
  } else {
    body = (
      <p className="text-muted-foreground text-sm">{t("detail.notes.empty")}</p>
    );
  }

  return (
    <>
      <DocSidebarLayout
        className={className}
        inlineMinWidth={1100}
        resizable
        sidebar={pageList}
        sidebarLabel={t("detail.notes.pages")}
        storageKey={PROJECT_NOTES_SIDEBAR_KEY}
      >
        <div className={cn("mt-4 max-w-3xl", alignToCover && "px-7")}>
          {body}
        </div>
      </DocSidebarLayout>

      <AlertDialog
        onOpenChange={(open) => !open && setNoteToDelete(null)}
        open={noteToDelete !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("detail.notes.deleteTitle", {
                title: noteToDelete?.title || t("detail.notes.untitled"),
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("detail.notes.deleteDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("detail.portal.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmDelete}
            >
              {t("detail.notes.deletePage")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
