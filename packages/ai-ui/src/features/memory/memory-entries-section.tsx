"use client";

// One memory key — a person, a Space, the company, or an agent's own — as
// agents are shown it: its working memory (how things are now), then one
// dated line per fact, oldest first, with the id an agent forgets it by. A person with the right may add,
// correct or remove a line; company lines have no edit (remove, add again),
// because core writes them and edits nothing in place.
import { MEMORY_BODY_MAX_CHARS } from "@engenty/ai-core/browser";
import { useTranslation } from "@engenty/i18n/ui";
import { Button, CardSection, Input } from "@engenty/ui-core";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import {
  type MemoryEntryDto,
  type MemoryEntryKeyInput,
  useMemoryEntriesQuery,
  useMemoryEntryMutations,
} from "./memory-entries-api.js";
import { WorkingMemoryFields } from "./working-memory-fields.js";

export function MemoryEntriesSection({
  description,
  entryKey,
  title,
}: {
  description: string;
  entryKey: MemoryEntryKeyInput;
  title: string;
}) {
  const { t } = useTranslation("ai-ui");
  const query = useMemoryEntriesQuery(entryKey);
  const { add, edit, remove } = useMemoryEntryMutations(entryKey);
  const [draft, setDraft] = useState("");
  const data = query.data;
  const canEdit = data?.can_edit === true;
  const editable = canEdit && entryKey.scope !== "company";
  const failure = add.error ?? edit.error ?? remove.error;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const body = draft.trim();
    if (body) {
      add.mutate(body, { onSuccess: () => setDraft("") });
    }
  };

  return (
    <CardSection
      cardVariant="compact"
      description={description}
      headerVariant="compact"
      title={title}
    >
      <WorkingMemoryFields entryKey={entryKey} />
      {query.isLoading ? (
        <p className="text-muted-foreground text-xs">
          {t("memoryEntries.loading")}
        </p>
      ) : data?.entries.length ? (
        <ul className="-mx-1 flex max-h-72 flex-col overflow-y-auto">
          {data.entries.map((entry) => (
            <MemoryEntryRow
              canRemove={canEdit}
              editable={editable}
              entry={entry}
              key={entry.id}
              onEdit={(body) => edit.mutate({ body, id: entry.id })}
              onRemove={() => remove.mutate(entry.id)}
              pending={edit.isPending || remove.isPending}
            />
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-xs">
          {t("memoryEntries.empty")}
        </p>
      )}
      {canEdit ? (
        <form className="mt-2 flex items-center gap-2" onSubmit={submit}>
          <Input
            aria-label={t("memoryEntries.addPlaceholder")}
            className="h-8 text-xs"
            maxLength={MEMORY_BODY_MAX_CHARS}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={t("memoryEntries.addPlaceholder")}
            value={draft}
          />
          <Button
            aria-label={t("memoryEntries.add")}
            className="size-8 shrink-0"
            disabled={!draft.trim() || add.isPending}
            size="icon"
            type="submit"
            variant="ghost"
          >
            <Plus className="size-3.5" />
          </Button>
        </form>
      ) : null}
      {data ? (
        <p className="mt-1 text-muted-foreground text-xs">
          {t("memoryEntries.count", {
            count: data.characters,
            max: data.max_chars,
          })}
        </p>
      ) : null}
      {failure ? (
        <p className="text-destructive text-xs">
          {failure instanceof Error
            ? failure.message
            : t("memoryEntries.saveFailed")}
        </p>
      ) : null}
    </CardSection>
  );
}

function MemoryEntryRow({
  canRemove,
  editable,
  entry,
  onEdit,
  onRemove,
  pending,
}: {
  canRemove: boolean;
  editable: boolean;
  entry: MemoryEntryDto;
  onEdit: (body: string) => void;
  onRemove: () => void;
  pending: boolean;
}) {
  const { t } = useTranslation("ai-ui");
  const [draft, setDraft] = useState<string | null>(null);

  if (draft !== null) {
    return (
      <li className="px-1 py-1">
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const body = draft.trim();
            if (body && body !== entry.body) {
              onEdit(body);
            }
            setDraft(null);
          }}
        >
          <Input
            aria-label={t("memoryEntries.edit")}
            autoFocus
            className="h-8 text-xs"
            maxLength={MEMORY_BODY_MAX_CHARS}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setDraft(null);
              }
            }}
            value={draft}
          />
          <Button disabled={pending} size="sm" type="submit">
            {t("memoryEntries.save")}
          </Button>
        </form>
      </li>
    );
  }

  return (
    <li className="group/entry flex items-start gap-2 rounded-md px-1 py-1 hover:bg-muted/50">
      <span className="shrink-0 pt-px font-mono text-[0.625rem] text-muted-foreground">
        {entry.created_at.slice(0, 10)}
      </span>
      <span className="min-w-0 flex-1 text-xs leading-relaxed">
        {entry.body}
      </span>
      <span className="flex shrink-0 opacity-0 transition-opacity focus-within:opacity-100 group-hover/entry:opacity-100">
        {editable ? (
          <Button
            aria-label={t("memoryEntries.edit")}
            className="size-6"
            disabled={pending}
            onClick={() => setDraft(entry.body)}
            size="icon"
            type="button"
            variant="ghost"
          >
            <Pencil className="size-3" />
          </Button>
        ) : null}
        {canRemove ? (
          <Button
            aria-label={t("memoryEntries.remove")}
            className="size-6 text-destructive hover:bg-destructive/10"
            disabled={pending}
            onClick={onRemove}
            size="icon"
            type="button"
            variant="ghost"
          >
            <Trash2 className="size-3" />
          </Button>
        ) : null}
      </span>
    </li>
  );
}
