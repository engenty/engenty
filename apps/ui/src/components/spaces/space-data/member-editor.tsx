/**
 * `Derived`, carrying the reason behind it.
 *
 * The sentence that used to sit above the table — a collection view saves as a
 * bulk import, not a file save — is the tooltip now: something the writer needs
 * to know once, not a paragraph the table has to start below every time. The
 * CTA says `Import changes` rather than `Save`, and the result reports counts,
 * so the meaning survives even unread.
 */

import {
  isFileStorageMarkdownMime,
  isFileStoragePdfMime,
} from "@engenty/file-storage";
import { useTranslation } from "@engenty/i18n/ui";
import { CsvTable } from "@engenty/import";
import { RichEditor } from "@engenty/tiptap-editor/rich";
import {
  Badge,
  Button,
  cn,
  Spinner,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@engenty/ui-core";
import { isSpaceDataCsvContentType } from "@/lib/space-data-agent-context";
import { BlobFilePreview } from "./file-preview";
import { csvTableLabels } from "./labels";
import { type MemberDraft, useMemberDraft } from "./member-draft";

export function DerivedBadge({ collection }: { collection: boolean }) {
  const { t } = useTranslation("common");
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="secondary">
            {t("spaces.data.derived", { defaultValue: "Derived" })}
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          {collection
            ? t("spaces.data.csv.collectionHint", {
                defaultValue:
                  "The whole collection as one table. Saving it is a bulk import, not a file save — it reports what it created, updated and refused.",
              })
            : t("spaces.data.derivedHint", {
                defaultValue:
                  "A render of the record — edit the source members instead.",
              })}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** A member's CTAs — in the topbar when it owns the pane, inline in a bundle. */
export function MemberActions({ state }: { state: MemberDraft }) {
  const { t } = useTranslation("common");
  return (
    <>
      {state.collection && !state.editingCollection ? (
        <Button onClick={state.startCollectionEdit} size="sm" variant="outline">
          {t("spaces.data.csv.edit", { defaultValue: "Edit table" })}
        </Button>
      ) : null}
      {state.collection && state.editingCollection ? (
        <>
          <Button
            disabled={state.importing}
            onClick={state.cancelCollectionEdit}
            size="sm"
            variant="ghost"
          >
            {t("actions.cancel", { defaultValue: "Cancel" })}
          </Button>
          <Button
            disabled={!state.dirty || state.importing}
            onClick={state.runImport}
            size="sm"
          >
            {state.importing ? <Spinner className="size-3" /> : null}
            {t("spaces.data.csv.import", { defaultValue: "Import changes" })}
          </Button>
        </>
      ) : null}
      {state.gridEditable ? (
        <>
          <Button onClick={state.addRow} size="sm" variant="ghost">
            {t("spaces.data.csv.addRow", { defaultValue: "Add row" })}
          </Button>
          <Button onClick={state.addColumn} size="sm" variant="ghost">
            {t("spaces.data.csv.addColumn", { defaultValue: "Add column" })}
          </Button>
        </>
      ) : null}
      {state.editable ? (
        <Button
          disabled={!state.dirty || state.saving}
          onClick={state.save}
          size="sm"
        >
          {state.saving ? <Spinner className="size-3" /> : null}
          {t("actions.save", { defaultValue: "Save" })}
        </Button>
      ) : null}
    </>
  );
}

/**
 * What a write answered with: the import's counts, or the 409.
 *
 * Above the editor and only when there is something to say, so nothing pushes
 * the table down in the ordinary case.
 */
export function MemberReport({
  className,
  state,
}: {
  className?: string;
  state: MemberDraft;
}) {
  const { t } = useTranslation("common");
  if (!(state.imported || state.error)) {
    return null;
  }
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {state.imported ? (
        <div className="rounded-md border border-border-soft px-3 py-2 text-xs">
          <p className="font-medium">
            {t("spaces.data.csv.imported", {
              created: state.imported.created,
              defaultValue:
                "{{created}} created · {{updated}} updated · {{failed}} refused",
              failed: state.imported.failed.length,
              updated: state.imported.updated,
            })}
          </p>
          {/* Every refusal, with its reason — a count alone would leave the
              writer guessing which rows to fix. */}
          {state.imported.failed.length > 0 ? (
            <ul className="mt-1 list-disc pl-4 text-muted-foreground">
              {state.imported.failed.map((entry) => (
                <li key={`${String(entry.row)}-${entry.reason}`}>
                  {t("spaces.data.csv.failedRow", {
                    defaultValue: "Row {{row}}: {{reason}}",
                    reason: entry.reason,
                    row: entry.row,
                  })}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {state.error ? (
        // The 409 lands here verbatim: "changed since you opened it" is
        // information the writer must act on, not a toast to dismiss.
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs">
          {state.error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The member itself: a grid for a CSV, monospace text for anything else.
 *
 * `flush` drops the editor's own border and rounding, because when the member
 * owns the pane the pane's edges ARE its edges — a rounded card inset from the
 * window is a table pretending to be a widget.
 */
export function MemberEditorBody({
  flush,
  member,
  state,
}: {
  flush: boolean;
  member: {
    contentType: string;
    encoding?: "base64" | "utf8";
    name?: string;
  };
  state: MemberDraft;
}) {
  const { t } = useTranslation("common");
  const binaryPreview =
    member.encoding === "base64" &&
    (isFileStoragePdfMime(member.contentType, member.name) ||
      member.contentType.startsWith("image/"));
  if (binaryPreview) {
    return (
      <BlobFilePreview
        content={state.draft}
        encoding="base64"
        label={member.name ?? member.contentType}
        mime={member.contentType}
      />
    );
  }
  if (isFileStorageMarkdownMime(member.contentType)) {
    return (
      <div
        className={
          flush
            ? "min-h-0 flex-1 overflow-y-auto px-6 py-4"
            : "min-h-[16rem] overflow-y-auto"
        }
      >
        <RichEditor
          editable={state.editable}
          key={state.editable ? "edit" : "read"}
          markdown={state.draft}
          onChange={(_json, markdown) => state.setDraft(markdown)}
          showToolbar={state.editable}
        />
      </div>
    );
  }
  if (isSpaceDataCsvContentType(member.contentType)) {
    // A CSV is a table, and a textarea makes the reader parse it by eye. The
    // grid is the SAME parser the import wizard reads with, so what is shown
    // here is what an import of these bytes would see.
    return (
      <CsvTable
        className={flush ? "rounded-none border-0" : undefined}
        labels={csvTableLabels(t)}
        onChange={state.setDraft}
        readOnly={!state.gridEditable}
        value={state.draft}
      />
    );
  }
  return (
    <Textarea
      className={
        flush
          ? "min-h-0 flex-1 resize-none rounded-none border-0 font-mono text-xs"
          : "min-h-[16rem] font-mono text-xs"
      }
      onChange={(event) => state.setDraft(event.target.value)}
      readOnly={!state.editable}
      spellCheck={false}
      value={state.draft}
    />
  );
}

/** One member of a bundle: its own header row, its own CTAs, then the editor. */
export function MemberEditor({
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
}) {
  const state = useMemberDraft({ document, member, onSaved, spaceId });
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="font-medium text-sm">{member.name}</span>
        {member.derived ? <DerivedBadge collection={state.collection} /> : null}
        <span className="flex-1" />
        <MemberActions state={state} />
      </div>
      <MemberReport state={state} />
      <MemberEditorBody flush={false} member={member} state={state} />
    </div>
  );
}
