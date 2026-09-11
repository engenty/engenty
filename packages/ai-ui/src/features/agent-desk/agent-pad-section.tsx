// One of an agent's own documents — AGENTS.md (instructions), MEMORY.md or
// TASKS.md — rendered as compact markdown (checkboxes stay checkboxes), with
// an edit toggle that swaps in a textarea. The server owns each format and
// cap; the section only refuses to submit what it already knows is too long.
// Shared by the desk's Manage panel and the copilot's Settings page, which
// differ only in the hooks. Both views cap their height and scroll inside:
// the drawer is a column of sections, not a page for one of them.
import { useTranslation } from "@engenty/i18n/ui";
import { Badge, Button, CardSection, Textarea } from "@engenty/ui-core";
import { Pencil } from "lucide-react";
import { useState } from "react";
import { MessageResponse } from "../../components/presentation.js";
import { COMPACT_MARKDOWN_PROSE_CLASSNAME } from "../../lib/admin/compact-markdown-prose-classname.js";

const PAD_PROSE_CLASSNAME = [
  COMPACT_MARKDOWN_PROSE_CLASSNAME,
  "text-xs [&_p]:text-xs [&_li]:text-xs [&_li]:leading-relaxed",
  "[&_h1]:mt-2 [&_h1]:mb-0.5 [&_h1]:text-xs [&_h1]:font-semibold",
  "[&_h2]:mt-2 [&_h2]:mb-0.5 [&_h2]:text-[0.6875rem] [&_h2]:font-semibold [&_h2]:uppercase [&_h2]:tracking-wider [&_h2]:text-muted-foreground",
  "[&_h3]:mt-1.5 [&_h3]:mb-0.5 [&_h3]:text-xs [&_h3]:font-semibold",
  "[&_ul]:pl-4 [&_li]:pl-0",
  "[&_li:has(>input[type=checkbox])]:list-none [&_li:has(>input[type=checkbox])]:-ml-4",
  "[&_input[type=checkbox]]:mr-1.5 [&_input[type=checkbox]]:size-3 [&_input[type=checkbox]]:align-[-1px] [&_input[type=checkbox]]:accent-primary",
  "[&_li:has(>input[type=checkbox]:checked)]:text-muted-foreground [&_li:has(>input[type=checkbox]:checked)]:line-through",
].join(" ");

export interface AgentPadSave {
  error: unknown;
  isError: boolean;
  isPending: boolean;
  mutate: (value: string, options?: { onSuccess?: () => void }) => void;
}

export interface AgentPadClear {
  disabled: boolean;
  run: (onSuccess: () => void) => void;
}

export function AgentPadSection({
  badge,
  clear,
  editable,
  enabled,
  kind,
  maxChars,
  save,
  stored,
}: {
  /** Small label beside the counter — e.g. "override active" for instructions. */
  badge?: string | null;
  /** The pad's "empty it" action; omitted when emptying makes no sense. */
  clear?: AgentPadClear;
  editable: boolean;
  enabled: boolean;
  kind: "instructions" | "memory" | "tasks";
  /** Server cap; omitted when the document has none (no counter shown). */
  maxChars?: number;
  save: AgentPadSave;
  stored: string;
}) {
  const { t } = useTranslation("ai-ui");
  const [draft, setDraft] = useState<string | null>(null);
  const editing = draft !== null;
  const value = draft ?? stored;
  const dirty = editing && draft !== stored;
  const tooLarge = maxChars !== undefined && value.length > maxChars;
  const key = (suffix: string) => `agentDesk.manage.${kind}${suffix}`;
  const leave = () => setDraft(null);

  if (!enabled) {
    return null;
  }

  return (
    <CardSection
      cardClassName="group/pad relative"
      cardVariant="compact"
      description={t(key("Description"))}
      headerVariant="compact"
      title={t(key("Title"))}
      titleAction={
        badge ? (
          <Badge className="text-[0.625rem]" variant="secondary">
            {badge}
          </Badge>
        ) : null
      }
    >
      {editing ? (
        <div className="space-y-2">
          <Textarea
            aria-label={t(key("Title"))}
            autoFocus
            className="max-h-96 min-h-32 overflow-y-auto font-mono text-xs leading-relaxed [field-sizing:content]"
            onChange={(event) => setDraft(event.target.value)}
            placeholder={t(key("Placeholder"))}
            spellCheck={false}
            value={value}
          />
          <div className="-mb-1 flex items-center justify-between gap-3">
            <Counter
              countKey={key("Count")}
              length={value.length}
              maxChars={maxChars}
              t={t}
              tooLarge={tooLarge}
              tooLargeKey={key("TooLarge")}
            />
            <div className="flex items-center gap-2">
              <Button
                disabled={save.isPending}
                onClick={leave}
                size="sm"
                type="button"
                variant="ghost"
              >
                {t("agentDesk.manage.padCancel")}
              </Button>
              {clear ? (
                <Button
                  disabled={save.isPending || clear.disabled}
                  onClick={() => clear.run(leave)}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  {t(key("Clear"))}
                </Button>
              ) : null}
              <Button
                disabled={!dirty || tooLarge || save.isPending}
                onClick={() => save.mutate(value, { onSuccess: leave })}
                size="sm"
                type="button"
              >
                {t(key("Save"))}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div>
          {/* The pen sits in the field's own top-right corner and appears on
              hover (always, once focused by keyboard). */}
          {editable ? (
            <Button
              aria-label={t("agentDesk.manage.padEdit")}
              className="absolute top-1 right-1 size-6 opacity-0 transition-opacity focus-visible:opacity-100 group-hover/pad:opacity-100"
              onClick={() => setDraft(stored)}
              size="icon"
              type="button"
              variant="ghost"
            >
              <Pencil className="size-3" />
            </Button>
          ) : null}
          {stored ? (
            <div className="max-h-72 overflow-y-auto">
              <MessageResponse className={PAD_PROSE_CLASSNAME}>
                {stored}
              </MessageResponse>
            </div>
          ) : (
            <p className="text-muted-foreground text-xs">{t(key("Empty"))}</p>
          )}
          {/* Only a capped document reserves the line; AGENTS.md ends flush
              with the card. */}
          {maxChars === undefined ? null : (
            <div className="mt-1 -mb-1">
              <Counter
                countKey={key("Count")}
                length={value.length}
                maxChars={maxChars}
                t={t}
                tooLarge={tooLarge}
                tooLargeKey={key("TooLarge")}
              />
            </div>
          )}
        </div>
      )}
      {save.isError ? (
        <p className="text-destructive text-xs">
          {save.error instanceof Error
            ? save.error.message
            : t("agentDesk.manage.saveFailed")}
        </p>
      ) : null}
    </CardSection>
  );
}

function Counter({
  countKey,
  length,
  maxChars,
  t,
  tooLarge,
  tooLargeKey,
}: {
  countKey: string;
  length: number;
  maxChars: number | undefined;
  t: (key: string, options?: Record<string, unknown>) => string;
  tooLarge: boolean;
  tooLargeKey: string;
}) {
  if (maxChars === undefined) {
    return <span />;
  }
  return (
    <p
      className={
        tooLarge ? "text-destructive text-xs" : "text-muted-foreground text-xs"
      }
    >
      {tooLarge
        ? t(tooLargeKey, { max: maxChars })
        : t(countKey, { count: length, max: maxChars })}
    </p>
  );
}
