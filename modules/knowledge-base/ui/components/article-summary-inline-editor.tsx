/**
 * Article edit — inline lead summary with optional AI generation from title + body.
 */

import { useTranslation } from "@engenty/i18n/ui";
import { useMutation } from "@engenty/query-client";
import { Button, cn } from "@engenty/ui-core";
import { AnimatedLoaderIcon } from "@engenty/ui-icons";
import { Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { generateArticleSummary } from "../api.js";

export interface ArticleSummaryInlineEditorProps {
  contentMarkdown: string;
  onChange: (summary: string) => void;
  summary: string;
  title: string;
}

export function ArticleSummaryInlineEditor({
  contentMarkdown,
  onChange,
  summary,
  title,
}: ArticleSummaryInlineEditorProps) {
  const { t } = useTranslation("kb");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(summary);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!editing) {
      setDraft(summary);
    }
  }, [summary, editing]);

  useEffect(() => {
    if (!editing) {
      return;
    }
    const id = requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
    });
    return () => cancelAnimationFrame(id);
  }, [editing]);

  const generateMut = useMutation({
    mutationFn: () =>
      generateArticleSummary({
        title,
        content_markdown: contentMarkdown,
      }),
    onSuccess: (result) => {
      const next = result.summary.trim();
      onChange(next);
      setDraft(next);
      setEditing(true);
      toast.success(t("article.generate_summary_success"));
    },
    onError: (err) => {
      toast.error(
        err instanceof Error
          ? err.message
          : t("article.generate_summary_failed")
      );
    },
  });

  const canGenerate = Boolean(title.trim() || contentMarkdown.trim());

  function commit() {
    setEditing(false);
    onChange(draft.trim());
  }

  function startEdit() {
    setDraft(summary);
    setEditing(true);
  }

  const summaryBodyClass =
    "text-base text-muted-foreground leading-relaxed whitespace-pre-wrap";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium text-muted-foreground text-sm">
          {t("article.fields.summary")}
        </p>
        <Button
          className="h-7 shrink-0 gap-1.5 px-2 text-muted-foreground text-xs hover:text-foreground"
          disabled={!canGenerate || generateMut.isPending}
          onClick={() => generateMut.mutate()}
          size="sm"
          type="button"
          variant="ghost"
        >
          {generateMut.isPending ? (
            <AnimatedLoaderIcon aria-hidden play="always" size="xs" />
          ) : (
            <Sparkles aria-hidden className="h-3.5 w-3.5" />
          )}
          {t("article.generate_summary")}
        </Button>
      </div>

      {editing ? (
        <textarea
          aria-label={t("article.fields.summary")}
          className={cn(
            summaryBodyClass,
            "min-h-[4rem] w-full resize-y appearance-none rounded-md border-0 bg-transparent p-0 shadow-none outline-none ring-0 placeholder:text-muted-foreground/60 focus:ring-0"
          )}
          maxLength={2048}
          onBlur={commit}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              setDraft(summary);
              setEditing(false);
            }
          }}
          placeholder={t("article.summary_placeholder")}
          ref={textareaRef}
          rows={3}
          value={draft}
        />
      ) : summary.trim() ? (
        <button
          className={cn(
            summaryBodyClass,
            "block w-full cursor-text rounded-md px-0 py-0.5 text-left transition-colors hover:bg-muted/30"
          )}
          onClick={startEdit}
          type="button"
        >
          {summary.trim()}
        </button>
      ) : (
        <button
          className="block w-full cursor-text rounded-md border border-muted-foreground/30 border-dashed px-2 py-2 text-left text-muted-foreground/60 text-sm transition-colors hover:border-muted-foreground/50 hover:bg-muted/20"
          onClick={startEdit}
          type="button"
        >
          {t("article.summary_placeholder")}
        </button>
      )}
    </div>
  );
}
