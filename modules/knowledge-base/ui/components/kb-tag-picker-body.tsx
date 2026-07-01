/**
 * Shared tag-picker UI (badges + add row) — used by form KbTagPicker and article property editor.
 */

import { useTranslation } from "@engenty/i18n/ui";
import { useMutation, useQuery, useQueryClient } from "@engenty/query-client";
import { Badge, Button, cn, Input } from "@engenty/ui-core";
import { Plus } from "lucide-react";
import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useState,
} from "react";
import { toast } from "sonner";
import { createTag } from "../api.js";
import { tagsQueryOptions } from "../queries.js";
import {
  articlePropertyTagChipHoverClassName,
  articlePropertyTagChipToneClassName,
} from "./article-properties-panel/article-property-shell.js";

function slugifyTagSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export interface KbTagPickerBodyProps {
  kbId: string;
  onSelectedTagIdsChange: Dispatch<SetStateAction<string[]>>;
  selectedTagIds: string[];
}

export function KbTagPickerBody({
  kbId,
  selectedTagIds,
  onSelectedTagIdsChange,
}: KbTagPickerBodyProps) {
  const { t } = useTranslation("kb");
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");

  const { data: tags = [], isLoading } = useQuery(tagsQueryOptions(kbId));

  const createMut = useMutation({
    mutationFn: (name: string) => {
      const trimmed = name.trim();
      const base = slugifyTagSlug(trimmed);
      const slug = base.length > 0 ? base : "tag";
      return createTag({
        kb_id: kbId,
        name: trimmed,
        slug,
        color: null,
      });
    },
    onSuccess: (tag) => {
      queryClient.invalidateQueries({ queryKey: ["kb", "tags", kbId] });
      onSelectedTagIdsChange((prev) =>
        prev.includes(tag.id) ? prev : [...prev, tag.id]
      );
      setDraft("");
    },
    onError: (err) => {
      toast.error(
        err instanceof Error
          ? err.message
          : t(
              "article.tags_create_error",
              "Could not create tag. It may already exist."
            )
      );
    },
  });

  const toggle = useCallback(
    (id: string) => {
      onSelectedTagIdsChange((prev) =>
        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      );
    },
    [onSelectedTagIdsChange]
  );

  const submitDraft = useCallback(() => {
    const name = draft.trim();
    if (!name || createMut.isPending) {
      return;
    }
    createMut.mutate(name);
  }, [createMut, draft]);

  if (!kbId) {
    return (
      <p className="text-[0.625rem] text-muted-foreground leading-snug">
        {t("article.tags_select_kb", "Select a knowledge base to manage tags.")}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {isLoading ? (
          <span className="text-[0.625rem] text-muted-foreground">…</span>
        ) : tags.length === 0 ? (
          <p className="text-[0.625rem] text-muted-foreground leading-snug">
            {t(
              "article.tags_empty",
              "No tags yet. Add one below or they will appear here once created."
            )}
          </p>
        ) : null}
        {tags.map((tag) => {
          const selected = selectedTagIds.includes(tag.id);
          return (
            <Badge
              className={cn(
                "kb-property-tag cursor-pointer font-normal",
                selected
                  ? "hover:bg-primary/90"
                  : cn(
                      articlePropertyTagChipToneClassName,
                      articlePropertyTagChipHoverClassName
                    )
              )}
              key={tag.id}
              onClick={() => toggle(tag.id)}
              variant={selected ? "default" : "secondary"}
            >
              {tag.name}
            </Badge>
          );
        })}
      </div>
      <div className="flex max-w-full items-center gap-1.5">
        <Input
          className="h-8 min-w-0 flex-1 text-sm"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submitDraft();
            }
          }}
          placeholder={t("article.tags_add_placeholder", "New tag name…")}
          value={draft}
        />
        <Button
          className="h-8 shrink-0 px-2 text-xs"
          disabled={!draft.trim() || createMut.isPending}
          onClick={submitDraft}
          size="sm"
          type="button"
          variant="outline"
        >
          <Plus className="mr-0.5 h-3 w-3" />
          {t("article.tags_add", "Add tag")}
        </Button>
      </div>
    </div>
  );
}
