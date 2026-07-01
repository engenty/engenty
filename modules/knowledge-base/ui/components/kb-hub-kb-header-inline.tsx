/**
 * KB hub header: Notion-style hover chrome.
 *
 * - Hover anywhere in the header area to reveal the action bar
 *   ("Add icon", "Add cover", "Add description") and per-field pencil buttons.
 * - Click the title or description area to edit inline (offers DocumentTitle pattern).
 * - Icon: emoji shown large above the title; click to pick or remove.
 * - Cover is rendered in {@link KbHubCover}; title/description/icon sit in the cover band.
 *   The "Add cover" shortcut in this action bar is optional (`showAddCoverShortcut`).
 * - Pass `editable={false}` for view mode (static title/description, no hover pencils).
 */

import { useTranslation } from "@engenty/i18n/ui";
import { useMutation, useQueryClient } from "@engenty/query-client";
import { Button, cn, EmojiIconChooser } from "@engenty/ui-core";
import { Pencil, Smile } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { KnowledgeBase } from "../../src/schema/types.js";
import { updateKb } from "../api.js";
import { kbDisplayName } from "../kb-display-name.js";
import {
  kbEmojiIconChooserLabels,
  kbEmojiPickerLocale,
} from "../lib/kb-emoji-icon-chooser-labels.js";
import { applyKnowledgeBaseToKbQueries, kbsQueryOptions } from "../queries.js";
import { KbHubAddCoverButton } from "./kb-hub-cover.js";

type HubHeaderEditField = "name" | "description";

const KB_LIST_KEY = kbsQueryOptions.queryKey;

export function KbHubKbHeaderInline({
  kb,
  editable = false,
  onCoverMutationError,
  onOptimisticCoverChange,
  surface = "default",
  /** When false, omit the "Add cover" ghost (e.g. hub hero embeds cover controls on the band). */
  showAddCoverShortcut = true,
}: {
  kb: KnowledgeBase;
  editable?: boolean;
  onCoverMutationError?: (cover: KnowledgeBase["cover"]) => void;
  onOptimisticCoverChange?: (cover: KnowledgeBase["cover"]) => void;
  /** `on-cover`: light text over KB hub cover / scrim. */
  surface?: "default" | "on-cover";
  showAddCoverShortcut?: boolean;
}) {
  const onCover = surface === "on-cover";
  const { t, i18n } = useTranslation("kb");
  const queryClient = useQueryClient();
  const displayTitle = kbDisplayName(kb, t);

  const [nameDraft, setNameDraft] = useState(kb.name);
  const [descDraft, setDescDraft] = useState(kb.description ?? "");
  const [editingField, setEditingField] = useState<HubHeaderEditField | null>(
    null
  );
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const skipNameBlurCommit = useRef(false);
  const skipDescBlurCommit = useRef(false);

  useEffect(() => {
    setNameDraft(kb.name);
  }, [kb.id, kb.name]);

  useEffect(() => {
    setDescDraft(kb.description ?? "");
  }, [kb.id, kb.description]);

  const mutation = useMutation({
    mutationFn: (
      patch: Partial<Pick<KnowledgeBase, "name" | "description" | "icon">>
    ) => updateKb(kb.id, patch),
    onSuccess: (updatedKb) => {
      applyKnowledgeBaseToKbQueries(queryClient, updatedKb);
      void queryClient.invalidateQueries({ queryKey: KB_LIST_KEY });
    },
  });

  const commitName = () => {
    const trimmed = nameDraft.trim();
    if (!trimmed) {
      setNameDraft(kb.name);
      return;
    }
    if (trimmed !== kb.name) {
      mutation.mutate({ name: trimmed });
    }
  };

  const commitDescription = () => {
    const trimmed = descDraft.trim();
    const next = trimmed.length > 0 ? trimmed : null;
    const prev = kb.description?.trim() || null;
    if (next !== prev) {
      mutation.mutate({ description: next });
    }
  };

  const nameTrimmed = kb.name.trim();
  const descTrimmed = (kb.description ?? "").trim();
  const busy = mutation.isPending;

  const finishNameBlur = () => {
    if (skipNameBlurCommit.current) {
      skipNameBlurCommit.current = false;
      return;
    }
    commitName();
    setEditingField((f) => (f === "name" ? null : f));
  };

  const finishDescBlur = () => {
    if (skipDescBlurCommit.current) {
      skipDescBlurCommit.current = false;
      return;
    }
    commitDescription();
    setEditingField((f) => (f === "description" ? null : f));
  };

  /**
   * The seeded default KB stores `name = "Default"` but reads as a localized
   * label (e.g. "Wissensdatenbank") via {@link kbDisplayName}. When the user
   * starts editing, opening the input with the raw "Default" string would be
   * confusing: the heading they just clicked said something else, and they
   * have to backspace "Default" before they can type their own name.
   */
  const nameIsLocalizedFallback = displayTitle !== kb.name;

  const startEdit = (field: HubHeaderEditField) => {
    if (busy) {
      return;
    }
    skipNameBlurCommit.current = false;
    skipDescBlurCommit.current = false;
    setEditingField(field);
    if (field === "name") {
      setNameDraft(nameIsLocalizedFallback ? "" : kb.name);
    } else {
      setDescDraft(kb.description ?? "");
    }
  };

  /* Pencil button: visible only while the outer group is hovered. */
  const pencilCls = cn(
    "shrink-0 opacity-0 transition-opacity duration-150 focus-visible:opacity-100 group-hover/kbheader:opacity-100",
    onCover ? "text-white/70 hover:text-white" : "text-muted-foreground"
  );

  const hasCover = Boolean(kb.cover);
  const hasDesc = descTrimmed.length > 0;
  const iconChooserLabels = kbEmojiIconChooserLabels(t);
  const emojiPickerLocale = kbEmojiPickerLocale(i18n.language);

  return (
    /* Outer hover group — everything inside reacts to this hover state */
    <div
      className={cn(
        "group/kbheader space-y-1",
        onCover && "drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]"
      )}
    >
      {/* Icon */}
      {kb.icon &&
        (editable ? (
          <EmojiIconChooser
            labels={iconChooserLabels}
            locale={emojiPickerLocale}
            onChange={(icon) => mutation.mutate({ icon })}
            onOpenChange={setIconPickerOpen}
            open={iconPickerOpen}
            trigger={
              <button
                className={cn(
                  "mb-1 rounded-lg p-1 text-5xl leading-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  onCover
                    ? "hover:bg-white/15 focus-visible:ring-white/50"
                    : "hover:bg-muted/60"
                )}
                title={t("hub.change_icon_hint")}
                type="button"
              >
                {kb.icon}
              </button>
            }
            value={kb.icon}
          />
        ) : (
          <div className="mb-1 text-5xl leading-none">{kb.icon}</div>
        ))}

      {/* Hover action bar — edit mode only */}
      {editable ? (
        <div
          className={cn(
            "mb-1 flex items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover/kbheader:opacity-100",
            /* Keep visible if icon picker is open */
            iconPickerOpen && "opacity-100"
          )}
        >
          {!kb.icon && (
            <EmojiIconChooser
              labels={iconChooserLabels}
              locale={emojiPickerLocale}
              onChange={(icon) => mutation.mutate({ icon })}
              onOpenChange={setIconPickerOpen}
              open={iconPickerOpen}
              trigger={
                <Button
                  className={cn(
                    "h-7 gap-1.5 px-2.5 text-xs",
                    onCover
                      ? "text-white/75 hover:bg-white/15 hover:text-white"
                      : "text-muted-foreground/60 hover:text-muted-foreground"
                  )}
                  disabled={busy}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  <Smile aria-hidden className="size-3.5" />
                  {t("hub.add_icon_hint")}
                </Button>
              }
              value={null}
            />
          )}

          {!hasCover && showAddCoverShortcut && (
            <KbHubAddCoverButton
              className={
                onCover
                  ? "text-white/75 hover:bg-white/15 hover:text-white"
                  : undefined
              }
              kb={kb}
              onCoverMutationError={onCoverMutationError}
              onOptimisticCoverChange={onOptimisticCoverChange}
            />
          )}

          {!hasDesc && editingField !== "description" && (
            <Button
              className={cn(
                "h-7 gap-1.5 px-2.5 text-xs",
                onCover
                  ? "text-white/75 hover:bg-white/15 hover:text-white"
                  : "text-muted-foreground/60 hover:text-muted-foreground"
              )}
              disabled={busy}
              onClick={() => startEdit("description")}
              size="sm"
              type="button"
              variant="ghost"
            >
              <Pencil aria-hidden className="size-3.5" />
              {t("hub.add_description_hint")}
            </Button>
          )}
        </div>
      ) : null}

      {/* Title row */}
      <div className="space-y-0.5">
        {editable && editingField === "name" ? (
          // Plain input — avoids Input component defaults (text-sm, h-8) that would
          // change the visual size vs. the heading button in view mode.
          <input
            aria-label={t("hub.edit_name_title")}
            autoFocus
            className={cn(
              "block w-full appearance-none bg-transparent px-1 py-0.5",
              "font-heading font-semibold text-[28px] leading-9 tracking-tight",
              "rounded-md border-0 shadow-none outline-none ring-0",
              "transition-colors",
              "focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0",
              onCover
                ? "placeholder:text-white/45"
                : "placeholder:text-muted-foreground",
              "disabled:pointer-events-none disabled:opacity-50",
              onCover && "text-white"
            )}
            disabled={busy}
            onBlur={finishNameBlur}
            onChange={(e) => setNameDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                skipNameBlurCommit.current = true;
                setNameDraft(nameIsLocalizedFallback ? "" : kb.name);
                setEditingField((f) => (f === "name" ? null : f));
              } else if (e.key === "Enter") {
                e.preventDefault();
                (e.target as HTMLInputElement).blur();
              }
            }}
            placeholder={
              nameIsLocalizedFallback
                ? displayTitle
                : t("hub.edit_name_placeholder")
            }
            value={nameDraft}
          />
        ) : editable ? (
          <div className="group/name flex items-center gap-1">
            <button
              className={cn(
                "min-w-0 flex-1 cursor-text rounded-md px-1 py-0.5 text-left",
                "font-heading font-semibold text-[28px] leading-9 tracking-tight",
                "transition-colors",
                onCover
                  ? "text-white hover:bg-white/12 focus-visible:bg-white/18 focus-visible:ring-white/40"
                  : "hover:bg-input/25 focus-visible:bg-input/35 focus-visible:ring-ring",
                "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-offset-0",
                "disabled:pointer-events-none disabled:opacity-50"
              )}
              disabled={busy}
              onClick={() => startEdit("name")}
              type="button"
            >
              {nameTrimmed.length > 0 ? (
                displayTitle
              ) : (
                <span
                  className={
                    onCover ? "text-white/55" : "text-muted-foreground"
                  }
                >
                  {t("hub.edit_name_placeholder")}
                </span>
              )}
            </button>
            <Button
              aria-label={t("hub.edit_name_action")}
              className={cn(pencilCls, "-mr-1")}
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                startEdit("name");
              }}
              size="icon-xs"
              title={t("hub.edit_name_description")}
              type="button"
              variant="ghost"
            >
              <Pencil aria-hidden className="size-3.5" />
            </Button>
          </div>
        ) : (
          <h1
            className={cn(
              "min-w-0 px-1 font-heading font-semibold text-[28px] leading-9 tracking-tight",
              onCover ? "text-white" : "text-foreground"
            )}
          >
            {nameTrimmed.length > 0 ? (
              displayTitle
            ) : (
              <span
                className={onCover ? "text-white/55" : "text-muted-foreground"}
              >
                {t("hub.edit_name_placeholder")}
              </span>
            )}
          </h1>
        )}
      </div>

      {/* Description row — shown when there is content or when editing */}
      {(hasDesc || (editable && editingField === "description")) &&
        (editable && editingField === "description" ? (
          // Plain textarea — avoids shared `Textarea` chrome (min-height, bg-card,
          // ui-canvas-field outline/shadow, resize handle) so inline editing looks
          // like the surrounding text instead of an embedded input box.
          <textarea
            aria-label={t("hub.edit_description_title")}
            autoFocus
            className={cn(
              "block min-h-0 w-full resize-none appearance-none bg-transparent px-1 py-0.5",
              "text-sm leading-relaxed transition-colors",
              "rounded-md border-0 shadow-none outline-none ring-0",
              "focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0",
              onCover
                ? "text-white/95 placeholder:text-white/45"
                : "text-muted-foreground placeholder:text-muted-foreground/60",
              "disabled:pointer-events-none disabled:opacity-50"
            )}
            disabled={busy}
            maxLength={2048}
            onBlur={finishDescBlur}
            onChange={(e) => setDescDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                skipDescBlurCommit.current = true;
                setDescDraft(kb.description ?? "");
                setEditingField((f) => (f === "description" ? null : f));
              }
            }}
            placeholder={t("hub.description_placeholder")}
            rows={2}
            value={descDraft}
          />
        ) : editable ? (
          <div className="group/desc flex items-start gap-1">
            <button
              className={cn(
                "min-w-0 flex-1 cursor-text rounded-md px-1 py-0.5 text-left",
                "text-sm leading-relaxed transition-colors",
                onCover
                  ? "text-white/85 hover:bg-white/12 focus-visible:bg-white/16 focus-visible:ring-white/35"
                  : "text-muted-foreground hover:bg-input/20 focus-visible:bg-input/25 focus-visible:ring-ring",
                "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-offset-0",
                "disabled:pointer-events-none disabled:opacity-50"
              )}
              disabled={busy}
              onClick={() => startEdit("description")}
              type="button"
            >
              <span
                className={
                  onCover
                    ? "whitespace-pre-wrap text-white/95"
                    : "whitespace-pre-wrap text-foreground/80"
                }
              >
                {kb.description?.trim()}
              </span>
            </button>
            <Button
              aria-label={t("hub.edit_description_action")}
              className={cn(pencilCls, "mt-1 -mr-1 self-start")}
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                startEdit("description");
              }}
              size="icon-xs"
              title={t("hub.edit_description_description")}
              type="button"
              variant="ghost"
            >
              <Pencil aria-hidden className="size-3.5" />
            </Button>
          </div>
        ) : (
          <p
            className={cn(
              "whitespace-pre-wrap px-1 text-sm leading-relaxed",
              onCover ? "text-white/90" : "text-muted-foreground"
            )}
          >
            {descTrimmed}
          </p>
        ))}
    </div>
  );
}
