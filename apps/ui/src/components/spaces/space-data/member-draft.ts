import { useTranslation } from "@engenty/i18n/ui";
import {
  appendCsvColumn,
  appendCsvRow,
  parseCsvMatrix,
  serializeCsvMatrix,
} from "@engenty/import";
import type { SpaceDataImportResult } from "@engenty/plugin-sdk";
import { useCallback, useEffect, useMemo, useState } from "react";
import { importSpaceData, writeSpaceData } from "@/lib/api/space-data-client";
import { isSpaceDataCsvContentType } from "@/lib/space-data-agent-context";

/** Text the browser can edit in place; everything else is shown, not offered. */
function isEditableText(member: {
  contentType: string;
  derived: boolean;
  editable: boolean;
}): boolean {
  return (
    member.editable &&
    !member.derived &&
    /^(text\/|application\/(json|yaml|xml))/.test(member.contentType)
  );
}

/**
 * A collection view — the whole table as one derived CSV, e.g. `contacts.csv`.
 *
 * Recognised by shape rather than by name: the node IS its single member, and
 * that member is a derived CSV. A collection has no single `updated_at` to
 * write against, which is exactly why its write path is the BULK IMPORT — it
 * answers with counts (created / updated / failed) instead of pretending a file
 * was saved.
 */
function isCollectionCsv(
  document: { name: string },
  member: {
    content: string;
    derived: boolean;
    name: string;
    contentType: string;
  }
): boolean {
  return (
    member.derived &&
    isSpaceDataCsvContentType(member.contentType) &&
    member.name === document.name
  );
}

/** One member's editing state — the CTAs and the grid both read from this. */
export interface MemberDraft {
  addColumn: () => void;
  addRow: () => void;
  cancelCollectionEdit: () => void;
  collection: boolean;
  dirty: boolean;
  draft: string;
  editable: boolean;
  editingCollection: boolean;
  error: string | null;
  gridEditable: boolean;
  imported: SpaceDataImportResult | null;
  importing: boolean;
  runImport: () => void;
  save: () => void;
  saving: boolean;
  setDraft: (value: string) => void;
  startCollectionEdit: () => void;
}

/**
 * A member's editing state, hoisted out of its markup.
 *
 * A hook rather than a component because the buttons that drive this state
 * render in the TOPBAR while the grid they drive fills the pane below it — two
 * places, one state. The handlers are stable and the result is memoized, so the
 * topbar's action node can be memoized too: the shell compares actions by
 * identity, and a fresh node every render would loop.
 */
export function useMemberDraft({
  document,
  member,
  onSaved,
  spaceId,
}: {
  document: { name: string; path: string; version: string };
  member: {
    content: string;
    contentType: string;
    derived: boolean;
    editable: boolean;
    name: string;
  };
  onSaved: () => void;
  spaceId: string;
}): MemberDraft {
  const { t } = useTranslation("common");
  const [draft, setDraft] = useState(member.content);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState<SpaceDataImportResult | null>(null);
  const [editingCollection, setEditingCollection] = useState(false);
  // Re-seed when the server's copy changes underneath — after a save, or after
  // the reader navigated away and back. Keyed on the version so an in-flight
  // edit is never clobbered by a re-render.
  useEffect(() => {
    setDraft(member.content);
    setError(null);
  }, [member.content]);

  const editable = isEditableText(member);
  const collection = isCollectionCsv(document, member);
  const gridEditable =
    isSpaceDataCsvContentType(member.contentType) &&
    (editable || editingCollection);
  const dirty = draft !== member.content;

  /**
   * A collection's save is an IMPORT, and it reports what it did.
   *
   * `created / updated / failed` is the whole reason a collection is not a file
   * save: 40 rows in, 3 rows refused, and the writer is told which — where a
   * "saved" toast would have hidden it.
   */
  const runImport = useCallback(() => {
    setImporting(true);
    setError(null);
    setImported(null);
    void importSpaceData({ content: draft, path: document.path, spaceId })
      .then((result) => {
        setImported(result);
        onSaved();
      })
      .catch((caught: unknown) => {
        setError(
          caught instanceof Error
            ? caught.message
            : t("spaces.data.saveFailed", { defaultValue: "Save failed." })
        );
      })
      .finally(() => setImporting(false));
  }, [document.path, draft, onSaved, spaceId, t]);

  const save = useCallback(() => {
    setSaving(true);
    setError(null);
    void writeSpaceData({
      baseVersion: document.version,
      content: draft,
      member: member.name,
      path: document.path,
      spaceId,
    })
      .then(onSaved)
      .catch((caught: unknown) => {
        setError(
          caught instanceof Error
            ? caught.message
            : t("spaces.data.saveFailed", { defaultValue: "Save failed." })
        );
      })
      .finally(() => setSaving(false));
  }, [
    document.path,
    document.version,
    draft,
    member.name,
    onSaved,
    spaceId,
    t,
  ]);

  const addRow = useCallback(
    () =>
      setDraft((prev) =>
        serializeCsvMatrix(appendCsvRow(parseCsvMatrix(prev)))
      ),
    []
  );
  const addColumn = useCallback(
    () =>
      setDraft((prev) =>
        serializeCsvMatrix(appendCsvColumn(parseCsvMatrix(prev)))
      ),
    []
  );
  const startCollectionEdit = useCallback(() => setEditingCollection(true), []);
  const cancelCollectionEdit = useCallback(() => {
    setEditingCollection(false);
    setDraft(member.content);
    setError(null);
  }, [member.content]);

  return useMemo(
    () => ({
      addColumn,
      addRow,
      cancelCollectionEdit,
      collection,
      dirty,
      draft,
      editable,
      editingCollection,
      error,
      gridEditable,
      imported,
      importing,
      runImport,
      save,
      saving,
      setDraft,
      startCollectionEdit,
    }),
    [
      addColumn,
      addRow,
      cancelCollectionEdit,
      collection,
      dirty,
      draft,
      editable,
      editingCollection,
      error,
      gridEditable,
      imported,
      importing,
      runImport,
      save,
      saving,
      startCollectionEdit,
    ]
  );
}
