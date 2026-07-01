/**
 * Category page header — Notion-style icon, cover shortcuts, title, description.
 *
 * Mirrors {@link KbHubKbHeaderInline}: hover action bar on edit pages; icon and
 * description also render in view mode.
 */

import { useTranslation } from "@engenty/i18n/ui";
import { Button, cn, EmojiIconChooser } from "@engenty/ui-core";
import { Pencil, Smile } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import type { KbCategory } from "../../src/schema/types.js";
import {
  kbEmojiIconChooserLabels,
  kbEmojiPickerLocale,
} from "../lib/kb-emoji-icon-chooser-labels.js";
import { useUpdateCategoryMutation } from "../queries.js";
import { CategoryCoverInheritanceField } from "./category-cover-inheritance-field.js";
import { CategoryInlineTitle } from "./category-inline-title.js";
import { CategoryPageAddCoverButton } from "./category-page-cover.js";

export function CategoryPageHeaderInline({
  category,
  editable = false,
  onCover = false,
  templateTopline,
}: {
  category: KbCategory;
  editable?: boolean;
  onCover?: boolean;
  /** Template binding topline (category edit). Renders above icon/title. */
  templateTopline?: ReactNode;
}) {
  const { t, i18n } = useTranslation("kb");
  const mutation = useUpdateCategoryMutation(category.kb_id);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [editingDescription, setEditingDescription] = useState(false);
  const [descDraft, setDescDraft] = useState(category.description ?? "");
  const skipDescBlurCommit = useRef(false);

  useEffect(() => {
    if (!editingDescription) {
      setDescDraft(category.description ?? "");
    }
  }, [category.description, editingDescription]);

  const busy = mutation.isPending;
  const hasCover = Boolean(category.cover);
  const hasIcon = Boolean(category.icon?.trim());
  const hasDesc = Boolean(category.description?.trim());
  const descTrimmed = category.description?.trim() ?? "";

  const pencilCls = cn(
    "shrink-0 opacity-0 transition-opacity duration-150 focus-visible:opacity-100 group-hover/catheader:opacity-100",
    onCover ? "text-white/70 hover:text-white" : "text-muted-foreground"
  );

  const ghostActionCls = cn(
    "h-7 gap-1.5 px-2.5 text-xs",
    onCover
      ? "text-white/75 hover:bg-white/15 hover:text-white"
      : "text-muted-foreground/60 hover:text-muted-foreground"
  );

  function commitDescription() {
    const trimmed = descDraft.trim();
    const next = trimmed.length > 0 ? trimmed : null;
    const prev = category.description?.trim() || null;
    if (next !== prev) {
      mutation.mutate({ id: category.id, input: { description: next } });
    }
  }

  function finishDescBlur() {
    if (skipDescBlurCommit.current) {
      skipDescBlurCommit.current = false;
      return;
    }
    commitDescription();
    setEditingDescription(false);
  }

  function startEditDescription() {
    if (busy) {
      return;
    }
    skipDescBlurCommit.current = false;
    setDescDraft(category.description ?? "");
    setEditingDescription(true);
  }

  function applyIcon(icon: string | null) {
    mutation.mutate({ id: category.id, input: { icon } });
  }

  const iconChooserLabels = kbEmojiIconChooserLabels(t);
  const emojiPickerLocale = kbEmojiPickerLocale(i18n.language);

  return (
    <div
      className={cn(
        "group/catheader space-y-1",
        onCover && "drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]"
      )}
    >
      {templateTopline ? (
        <div className="min-w-0 pb-1">{templateTopline}</div>
      ) : null}

      {hasIcon ? (
        editable ? (
          <EmojiIconChooser
            labels={iconChooserLabels}
            locale={emojiPickerLocale}
            onChange={(icon) => applyIcon(icon)}
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
                {category.icon}
              </button>
            }
            value={category.icon}
          />
        ) : (
          <div className="mb-1 text-5xl leading-none">{category.icon}</div>
        )
      ) : null}

      {editable ? (
        <div
          className={cn(
            "mb-1 flex items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover/catheader:opacity-100",
            iconPickerOpen && "opacity-100"
          )}
        >
          {hasIcon ? null : (
            <EmojiIconChooser
              labels={iconChooserLabels}
              locale={emojiPickerLocale}
              onChange={(icon) => applyIcon(icon)}
              onOpenChange={setIconPickerOpen}
              open={iconPickerOpen}
              trigger={
                <Button
                  className={ghostActionCls}
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

          {hasCover ? null : (
            <CategoryPageAddCoverButton
              className={
                onCover
                  ? "text-white/75 hover:bg-white/15 hover:text-white"
                  : undefined
              }
            />
          )}

          {hasDesc || editingDescription ? null : (
            <Button
              className={ghostActionCls}
              disabled={busy}
              onClick={startEditDescription}
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

      <CategoryInlineTitle
        category={category}
        editable={editable}
        onCover={onCover}
      />

      {editable && hasCover ? (
        <CategoryCoverInheritanceField category={category} onCover={onCover} />
      ) : null}

      {(hasDesc || editingDescription) &&
        (editingDescription ? (
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
                setDescDraft(category.description ?? "");
                setEditingDescription(false);
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
              onClick={startEditDescription}
              type="button"
            >
              <span
                className={
                  onCover
                    ? "whitespace-pre-wrap text-white/95"
                    : "whitespace-pre-wrap text-foreground/80"
                }
              >
                {descTrimmed}
              </span>
            </button>
            <Button
              aria-label={t("hub.edit_description_action")}
              className={cn(pencilCls, "mt-1 -mr-1 self-start")}
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                startEditDescription();
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
