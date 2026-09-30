"use client";

// A key's working memory — the fixed fields of its scope, how things are now
// (`WORKING_MEMORY_FIELDS`). Agents keep it up to date from conversations; a
// person with the right sets or clears a field here.
import {
  WORKING_MEMORY_FIELDS,
  WORKING_MEMORY_VALUE_MAX_CHARS,
} from "@engenty/ai-core/browser";
import { useTranslation } from "@engenty/i18n/ui";
import { Button, Input } from "@engenty/ui-core";
import { useState } from "react";
import {
  type MemoryEntryKeyInput,
  useMemoryEntriesQuery,
  useMemoryEntryMutations,
} from "./memory-entries-api.js";

export function WorkingMemoryFields({
  entryKey,
}: {
  entryKey: MemoryEntryKeyInput;
}) {
  const { t } = useTranslation("ai-ui");
  const query = useMemoryEntriesQuery(entryKey);
  const { setWorking } = useMemoryEntryMutations(entryKey);
  const [editing, setEditing] = useState<{
    key: string;
    value: string;
  } | null>(null);
  const data = query.data;
  if (!data) {
    return null;
  }
  const state = data.working.state;
  const label = (key: string) =>
    t(`memoryEntries.working.fields.${entryKey.scope}.${key}`);

  return (
    <div className="flex flex-col gap-0.5">
      <p className="font-medium text-muted-foreground text-xs">
        {t("memoryEntries.working.title")}
      </p>
      <dl className="-mx-1 flex flex-col">
        {WORKING_MEMORY_FIELDS[entryKey.scope].map((field) =>
          editing?.key === field.key ? (
            <form
              className="flex items-center gap-2 px-1 py-0.5"
              key={field.key}
              onSubmit={(event) => {
                event.preventDefault();
                const value = editing.value.trim();
                if (value !== (state[field.key] ?? "")) {
                  setWorking.mutate({ [field.key]: value || null });
                }
                setEditing(null);
              }}
            >
              <span className="w-28 shrink-0 text-muted-foreground text-xs">
                {label(field.key)}
              </span>
              <Input
                aria-label={t("memoryEntries.working.edit", {
                  field: label(field.key),
                })}
                autoFocus
                className="h-7 text-xs"
                maxLength={WORKING_MEMORY_VALUE_MAX_CHARS}
                onChange={(event) =>
                  setEditing({ key: field.key, value: event.target.value })
                }
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setEditing(null);
                  }
                }}
                value={editing.value}
              />
              <Button disabled={setWorking.isPending} size="sm" type="submit">
                {t("memoryEntries.working.save")}
              </Button>
            </form>
          ) : (
            <div
              className="flex items-baseline gap-2 rounded-md px-1 py-0.5 hover:bg-muted/50"
              key={field.key}
            >
              <dt className="w-28 shrink-0 text-muted-foreground text-xs">
                {label(field.key)}
              </dt>
              <dd className="min-w-0 flex-1 text-xs">
                {data.can_edit ? (
                  <button
                    aria-label={t("memoryEntries.working.edit", {
                      field: label(field.key),
                    })}
                    className="w-full text-left"
                    onClick={() =>
                      setEditing({
                        key: field.key,
                        value: state[field.key] ?? "",
                      })
                    }
                    type="button"
                  >
                    {state[field.key] ?? (
                      <span className="text-muted-foreground">
                        {t("memoryEntries.working.empty")}
                      </span>
                    )}
                  </button>
                ) : (
                  (state[field.key] ?? (
                    <span className="text-muted-foreground">
                      {t("memoryEntries.working.empty")}
                    </span>
                  ))
                )}
              </dd>
            </div>
          )
        )}
      </dl>
    </div>
  );
}
