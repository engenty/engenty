/**
 * Notion-style “move under…” picker: search + top-level targets + root.
 */

import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  ScrollArea,
} from "@engenty/ui-core";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { articlesQueryOptions } from "../queries.js";

function collectDescendantArticleIds(
  articles: Array<{ id: string; parent_article_id: string | null }>,
  rootId: string
): Set<string> {
  const byParent = new Map<string | null, string[]>();
  for (const a of articles) {
    const pid = a.parent_article_id;
    const list = byParent.get(pid) ?? [];
    list.push(a.id);
    byParent.set(pid, list);
  }
  const out = new Set<string>();
  const stack = [...(byParent.get(rootId) ?? [])];
  while (stack.length > 0) {
    const id = stack.pop()!;
    out.add(id);
    for (const c of byParent.get(id) ?? []) {
      stack.push(c);
    }
  }
  return out;
}

export interface ArticleMoveParentDialogProps {
  articleId: string;
  kbId: string;
  onMove: (parentArticleId: string | null) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

export function ArticleMoveParentDialog(props: ArticleMoveParentDialogProps) {
  const { open, onOpenChange, kbId, articleId, onMove } = props;
  const { t } = useTranslation("kb");
  const [q, setQ] = useState("");

  const { data: page, isLoading } = useQuery({
    ...articlesQueryOptions({
      kb_id: kbId,
      page_size: 500,
      sort_by: "title",
      sort_order: "asc",
    }),
    enabled: open && Boolean(kbId),
  });

  const rows = page?.data ?? [];

  const forbidden = useMemo(
    () => collectDescendantArticleIds(rows, articleId),
    [rows, articleId]
  );

  const topLevel = useMemo(
    () =>
      rows.filter(
        (a) =>
          !a.parent_article_id &&
          a.id !== articleId &&
          !forbidden.has(a.id) &&
          a.deleted_at == null
      ),
    [rows, articleId, forbidden]
  );

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) {
      return topLevel;
    }
    return topLevel.filter((a) => a.title.toLowerCase().includes(s));
  }, [topLevel, q]);

  const handlePick = (parentId: string | null) => {
    onMove(parentId);
    onOpenChange(false);
    setQ("");
  };

  return (
    <Dialog
      onOpenChange={(next) => {
        if (!next) {
          setQ("");
        }
        onOpenChange(next);
      }}
      open={open}
    >
      <DialogContent className="flex max-h-[min(70vh,520px)] w-full max-w-md flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="shrink-0 border-b px-4 py-3">
          <DialogTitle className="text-base">
            {t("article.overflow.move_dialog_title")}
          </DialogTitle>
        </DialogHeader>
        <div className="shrink-0 border-b px-3 py-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-9 pl-8"
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("article.overflow.move_dialog_search_placeholder")}
              value={q}
            />
          </div>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col p-1">
            <Button
              className="h-9 justify-start px-2 font-normal"
              onClick={() => handlePick(null)}
              type="button"
              variant="ghost"
            >
              {t("article.overflow.move_root")}
            </Button>
            {isLoading ? (
              <p className="px-2 py-3 text-muted-foreground text-sm">
                {t("article.overflow.move_loading")}
              </p>
            ) : filtered.length === 0 ? (
              <p className="px-2 py-3 text-muted-foreground text-sm">
                {t("article.overflow.move_empty")}
              </p>
            ) : (
              filtered.map((a) => (
                <Button
                  className="h-9 justify-start px-2 font-normal"
                  key={a.id}
                  onClick={() => handlePick(a.id)}
                  type="button"
                  variant="ghost"
                >
                  <span className="truncate">{a.title}</span>
                </Button>
              ))
            )}
          </div>
        </ScrollArea>
        <DialogFooter className="shrink-0 border-t px-3 py-2">
          <Button
            onClick={() => onOpenChange(false)}
            type="button"
            variant="outline"
          >
            {t("article.actions.cancel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
