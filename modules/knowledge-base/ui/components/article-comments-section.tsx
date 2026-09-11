/**
 * Flat article comments thread below the article body on detail view.
 */

import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import { Button, cn, Skeleton, Textarea } from "@engenty/ui-core";
import { AnimatedLoaderIcon } from "@engenty/ui-icons";
import { Pencil, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Article, ArticleComment } from "../../src/schema/types.js";
import { formatKbRelativeTime } from "../article-datetime.js";
import { resolveArticleEffectiveCommentsMode } from "../lib/kb-effective-comments-mode.js";
import {
  articleCommentsQueryOptions,
  categoriesQueryOptions,
  useArticleCommentsMutations,
  useKbsQuery,
} from "../queries.js";
import { getTenantUserBrief } from "../tenant-user-api.js";

function CommentAuthorName({ userId }: { userId: string | null }) {
  const { data } = useQuery({
    queryKey: ["tenant-user-brief", userId],
    queryFn: ({ signal }) => getTenantUserBrief(userId!, signal),
    enabled: Boolean(userId),
    staleTime: 120_000,
  });
  if (!userId) {
    return <>—</>;
  }
  return (
    <>
      {data?.display_name?.trim() ||
        data?.email?.split("@")[0]?.trim() ||
        userId}
    </>
  );
}

function ArticleCommentRow({
  comment,
  currentUserId,
  disabled,
  onDelete,
  onUpdate,
}: {
  comment: ArticleComment;
  currentUserId: string | null | undefined;
  disabled?: boolean;
  onDelete: (id: string) => void;
  onUpdate: (id: string, content: string) => void;
}) {
  const { t, i18n } = useTranslation("kb");
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const isOwn = Boolean(
    currentUserId && comment.created_by && comment.created_by === currentUserId
  );
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.content);

  const saveEdit = () => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === comment.content) {
      setEditing(false);
      setDraft(comment.content);
      return;
    }
    onUpdate(comment.id, trimmed);
    setEditing(false);
  };

  return (
    <li className="group/comment py-3 first:pt-0">
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="font-medium text-foreground text-sm">
            <CommentAuthorName userId={comment.created_by} />
          </span>
          <time
            className="text-muted-foreground text-xs"
            dateTime={comment.created_at}
          >
            {formatKbRelativeTime(comment.created_at, locale)}
          </time>
        </div>
        {isOwn && !disabled ? (
          <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover/comment:opacity-100">
            <Button
              aria-label={t("comments.edit")}
              className="h-7 w-7 p-0"
              onClick={() => setEditing(true)}
              size="sm"
              type="button"
              variant="ghost"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              aria-label={t("comments.delete")}
              className="h-7 w-7 p-0 text-destructive hover:text-destructive"
              onClick={() => onDelete(comment.id)}
              size="sm"
              type="button"
              variant="ghost"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : null}
      </div>
      {editing ? (
        <div className="mt-2 space-y-2">
          <Textarea
            className="min-h-[72px] text-sm"
            onChange={(e) => setDraft(e.target.value)}
            value={draft}
          />
          <div className="flex gap-2">
            <Button onClick={saveEdit} size="sm" type="button">
              {t("comments.save")}
            </Button>
            <Button
              onClick={() => {
                setEditing(false);
                setDraft(comment.content);
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              {t("common.cancel", "Cancel")}
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-1 whitespace-pre-wrap text-foreground/90 text-sm leading-relaxed">
          {comment.content}
        </p>
      )}
    </li>
  );
}

function ArticleCommentComposer({
  disabled,
  isPending,
  onPost,
}: {
  disabled?: boolean;
  isPending: boolean;
  onPost: (content: string) => Promise<void>;
}) {
  const { t } = useTranslation("kb");
  const [draft, setDraft] = useState("");
  const [active, setActive] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (active) {
      textareaRef.current?.focus();
    }
  }, [active]);

  const collapseIfEmpty = () => {
    if (!(draft.trim() || isPending)) {
      setActive(false);
    }
  };

  if (disabled) {
    return null;
  }

  if (!active) {
    return (
      <button
        className={cn(
          "mt-4 flex w-full rounded-md border border-border bg-transparent px-3 py-2.5",
          "text-left text-muted-foreground text-sm transition-colors",
          "hover:border-border hover:bg-muted/20"
        )}
        onClick={() => setActive(true)}
        type="button"
      >
        {t("comments.placeholder")}
      </button>
    );
  }

  return (
    <div className="mt-4 space-y-2">
      <Textarea
        className="min-h-[88px] text-sm"
        disabled={isPending}
        onBlur={collapseIfEmpty}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={t("comments.placeholder")}
        ref={textareaRef}
        value={draft}
      />
      <Button
        className={cn(
          "transition-opacity",
          draft.trim() || isPending
            ? "opacity-100"
            : "pointer-events-none opacity-0"
        )}
        disabled={!draft.trim() || isPending}
        onClick={() => {
          const trimmed = draft.trim();
          if (!trimmed) {
            return;
          }
          void onPost(trimmed).then(() => {
            setDraft("");
            setActive(false);
          });
        }}
        onMouseDown={(event) => event.preventDefault()}
        size="sm"
        type="button"
      >
        {isPending ? (
          <AnimatedLoaderIcon className="mr-2" play="always" size="sm" />
        ) : null}
        {t("comments.post")}
      </Button>
    </div>
  );
}

export interface ArticleCommentsSectionProps {
  article: Article;
  currentUserId?: string | null;
}

export function ArticleCommentsSection({
  article,
  currentUserId,
}: ArticleCommentsSectionProps) {
  const { t } = useTranslation("kb");
  const { data: categories = [] } = useQuery(
    categoriesQueryOptions(article.kb_id)
  );
  const { data: kbs = [] } = useKbsQuery();
  const kb = useMemo(
    () => kbs.find((row) => row.id === article.kb_id),
    [article.kb_id, kbs]
  );
  const mode = useMemo(
    () => resolveArticleEffectiveCommentsMode(article, kb, categories),
    [article, categories, kb]
  );
  const locked = Boolean(article.locked_at);

  const {
    data: comments = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    ...articleCommentsQueryOptions(article.id),
    enabled: mode !== "none",
  });

  const { create, update, remove } = useArticleCommentsMutations(article.id);

  const postComment = useCallback(
    async (content: string) => {
      await create.mutateAsync(content);
    },
    [create]
  );

  if (mode === "none") {
    return null;
  }

  return (
    <section className="mt-10 pt-2" id="article-comments">
      <div
        aria-hidden
        className="mx-auto mb-6 h-px w-full max-w-xl bg-border"
      />

      <h2 className="mb-4 font-semibold text-muted-foreground/70 text-xxs uppercase tracking-wider">
        {t("comments.section_title")}
      </h2>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : null}

      {isError ? (
        <div className="flex items-center gap-3 text-muted-foreground text-sm">
          <span>{t("comments.load_error")}</span>
          <Button
            onClick={() => refetch()}
            size="sm"
            type="button"
            variant="outline"
          >
            {t("comments.retry")}
          </Button>
        </div>
      ) : null}

      {isLoading || isError ? null : (
        <>
          {mode === "closed" ? (
            <p className="mb-4 text-muted-foreground text-sm">
              {t("comments.closed_banner")}
            </p>
          ) : null}
          <ul className="divide-y divide-border-soft">
            {comments.map((comment) => (
              <ArticleCommentRow
                comment={comment}
                currentUserId={currentUserId}
                disabled={mode !== "enabled" || locked}
                key={comment.id}
                onDelete={(id) => remove.mutate(id)}
                onUpdate={(id, content) =>
                  update.mutate({ commentId: id, content })
                }
              />
            ))}
          </ul>
        </>
      )}

      {mode === "enabled" && !locked && !isLoading && !isError ? (
        <ArticleCommentComposer
          isPending={create.isPending}
          onPost={postComment}
        />
      ) : null}
    </section>
  );
}
