/**
 * Article lifecycle transitions — shared between the title badge menu and overflow.
 */

import { useTranslation } from "@engenty/i18n/ui";
import { useMutation, useQueryClient } from "@engenty/query-client";
import {
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  Switch,
} from "@engenty/ui-core";
import { Archive, Check, Lock, Unlock } from "lucide-react";
import { type ReactNode, useCallback } from "react";
import { toast } from "sonner";
import type { Article } from "../../src/schema/types.js";
import { updateArticle } from "../api.js";
import { resolveArticleLifecycleIndicator } from "../lib/article-lifecycle-indicator.js";
import {
  articleDetailQueryOptions,
  invalidateKbGraphQueries,
} from "../queries.js";

function useArticleLifecyclePatch(article: Article) {
  const { t } = useTranslation("kb");
  const queryClient = useQueryClient();

  const invalidateArticle = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: articleDetailQueryOptions(article.id).queryKey,
    });
    void queryClient.invalidateQueries({ queryKey: ["kb", "articles"] });
    void invalidateKbGraphQueries(queryClient, article.kb_id);
  }, [article.id, article.kb_id, queryClient]);

  return useMutation({
    mutationFn: (patch: Record<string, unknown>) =>
      updateArticle(article.id, patch),
    onSuccess: () => {
      invalidateArticle();
      toast.success(t("article.overflow.saved"));
    },
    onError: (err) => {
      toast.error(
        err instanceof Error ? err.message : t("article.inline_save_error")
      );
    },
  });
}

export function ArticleLifecycleMenuItems({
  article,
  patchMut,
  showSectionLabel = true,
}: {
  article: Article;
  patchMut: {
    isPending: boolean;
    mutate: (patch: Record<string, unknown>) => void;
  };
  /** Badge menu shows current state in the trigger; overflow sub keeps a section label. */
  showSectionLabel?: boolean;
}) {
  const { t } = useTranslation("kb");
  const indicator = resolveArticleLifecycleIndicator(article);

  return (
    <DropdownMenuGroup>
      {showSectionLabel ? (
        <DropdownMenuLabel className="text-muted-foreground text-xs">
          {t(`article.lifecycle.${indicator.kind}`)}
        </DropdownMenuLabel>
      ) : null}
      {article.status === "draft" && !article.locked_at ? (
        <DropdownMenuItem
          disabled={patchMut.isPending}
          onSelect={() => patchMut.mutate({ status: "published" })}
        >
          <Check className="mr-2 h-4 w-4 opacity-70" />
          {t("article.overflow.approve")}
        </DropdownMenuItem>
      ) : null}
      {article.status === "published" && !article.locked_at ? (
        <DropdownMenuItem
          disabled={patchMut.isPending}
          onSelect={() => patchMut.mutate({ status: "archived" })}
        >
          <Archive className="mr-2 h-4 w-4 opacity-70" />
          {t("article.overflow.archive")}
        </DropdownMenuItem>
      ) : null}
      {article.status === "published" ? (
        <DropdownMenuItem
          className="flex items-center justify-between gap-3"
          disabled={patchMut.isPending}
          onSelect={(event) => event.preventDefault()}
        >
          <span className="flex items-center gap-2">
            {article.locked_at ? (
              <Unlock className="h-4 w-4 opacity-70" />
            ) : (
              <Lock className="h-4 w-4 opacity-70" />
            )}
            {article.locked_at
              ? t("article.overflow.unlock_page")
              : t("article.overflow.lock_page")}
          </span>
          <Switch
            aria-label={t("article.overflow.lock_page")}
            checked={Boolean(article.locked_at)}
            disabled={patchMut.isPending}
            onCheckedChange={(checked) =>
              patchMut.mutate({
                locked_at: checked ? new Date().toISOString() : null,
              })
            }
          />
        </DropdownMenuItem>
      ) : null}
    </DropdownMenuGroup>
  );
}

export function ArticleLifecycleBadgeMenu({
  article,
  badge,
  className,
}: {
  article: Article;
  badge: ReactNode;
  className?: string;
}) {
  const { t } = useTranslation("kb");
  const patchMut = useArticleLifecyclePatch(article);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={t("article.lifecycle.menu_aria")}
          className={cn(
            "rounded-full transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            className
          )}
          type="button"
        >
          {badge}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[220px]">
        <ArticleLifecycleMenuItems
          article={article}
          patchMut={patchMut}
          showSectionLabel={false}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export { useArticleLifecyclePatch };
