/**
 * Single page block row — header + body, hidden in view mode when empty.
 */

import { useTranslation } from "@engenty/i18n/ui";
import { cn } from "@engenty/ui-core";
import type {
  KbPageBlock,
  KbPageLayoutSettings,
} from "../../../src/schema/page-blocks.js";
import {
  movePageBlock,
  togglePageBlockVisibility,
  updatePageBlock,
} from "../../../src/schema/page-blocks.js";
import type { KbCategory } from "../../../src/schema/types.js";
import {
  isKbPageCategoriesBlockEmpty,
  isKbPageContentBlockEmpty,
} from "../../lib/page-blocks/page-block-empty.js";
import { patchPageBlockHeadline } from "../../lib/page-blocks/page-block-order.js";
import { useKbPageArticlesBlockEmpty } from "../../lib/page-blocks/use-kb-page-articles-block-empty.js";
import { useKbPageFaqsBlockEmpty } from "../../lib/page-blocks/use-kb-page-faqs-block-empty.js";
import { KbPageArticlesBlockView } from "./kb-page-articles-block.js";
import { KbPageBlockEditActions } from "./kb-page-block-edit-actions.js";
import { KbPageBlockHeader } from "./kb-page-block-header.js";
import type { KbPageBlocksEditorTarget } from "./kb-page-blocks-editor.js";
import { KbPageCategoriesBlockView } from "./kb-page-categories-block.js";
import { KbPageContentBlockView } from "./kb-page-content-block.js";
import { KbPageFaqsBlockView } from "./kb-page-faqs-block.js";

function blockDefaultLabel(
  block: KbPageBlock,
  target: KbPageBlocksEditorTarget,
  t: (key: string) => string
): string {
  if (block.type === "categories") {
    return t("page_blocks.categories.default_headline");
  }
  if (block.type === "articles") {
    if (target.kind === "hub" && block.headline == null) {
      return t("hub.latest");
    }
    return t("page_blocks.articles.default_headline");
  }
  if (block.type === "faqs") {
    return t("page_blocks.faqs.default_headline");
  }
  return "";
}

interface KbPageBlockRowProps {
  block: KbPageBlock;
  blockCount: number;
  blockIndex: number;
  categories: KbCategory[];
  isEditMode: boolean;
  kbId: string;
  kbSlug: string;
  onLayoutPatch: (
    updater: (prev: KbPageLayoutSettings) => KbPageLayoutSettings
  ) => void;
  onOpenSettings: (blockId: string) => void;
  parentCategoryId: string | null;
  target: KbPageBlocksEditorTarget;
}

export function KbPageBlockRow({
  block,
  blockIndex,
  blockCount,
  categories,
  isEditMode,
  kbId,
  kbSlug,
  onLayoutPatch,
  onOpenSettings,
  parentCategoryId,
  target,
}: KbPageBlockRowProps) {
  const { t } = useTranslation("kb");

  const articlesEmptyState = useKbPageArticlesBlockEmpty(
    block.type === "articles" ? block : null,
    kbId,
    categories,
    parentCategoryId ?? undefined
  );

  const faqsEmptyState = useKbPageFaqsBlockEmpty(
    block.type === "faqs" ? block : null,
    kbId
  );

  if (!(isEditMode || block.visible)) {
    return null;
  }

  const hideInViewMode =
    !isEditMode &&
    (block.type === "content"
      ? isKbPageContentBlockEmpty(block)
      : block.type === "categories"
        ? isKbPageCategoriesBlockEmpty(block, categories, parentCategoryId)
        : block.type === "articles"
          ? articlesEmptyState.isLoading || articlesEmptyState.isEmpty
          : block.type === "faqs" &&
            (faqsEmptyState.isLoading || faqsEmptyState.isEmpty));

  if (hideInViewMode) {
    return null;
  }

  const defaultLabel = blockDefaultLabel(block, target, t);
  const isContentBlock = block.type === "content";

  const blockEditActions = isEditMode ? (
    <KbPageBlockEditActions
      canMoveDown={blockIndex < blockCount - 1}
      canMoveUp={blockIndex > 0}
      className="pointer-events-auto opacity-0 transition-opacity group-focus-within/block:opacity-100 group-hover/block:opacity-100"
      onMoveDown={() =>
        onLayoutPatch((prev) => movePageBlock(prev, block.id, 1))
      }
      onMoveUp={() =>
        onLayoutPatch((prev) => movePageBlock(prev, block.id, -1))
      }
      onOpenSettings={
        isContentBlock ? undefined : () => onOpenSettings(block.id)
      }
      onToggleVisibility={() =>
        onLayoutPatch((prev) => togglePageBlockVisibility(prev, block.id))
      }
      showSettings={!isContentBlock}
      visible={block.visible}
    />
  ) : null;

  function renderBlockContent() {
    if (block.type === "content") {
      return (
        <KbPageContentBlockView
          block={block}
          editable={isEditMode}
          kbId={kbId}
          kbSlug={kbSlug}
          onChange={(patch) =>
            onLayoutPatch((prev) =>
              updatePageBlock(prev, block.id, patch as Partial<KbPageBlock>)
            )
          }
          placeholder={t("page_blocks.content_placeholder")}
        />
      );
    }
    if (block.type === "categories") {
      return (
        <KbPageCategoriesBlockView
          block={block}
          categories={categories}
          editable={isEditMode}
          kbId={kbId}
          kbSlug={kbSlug}
          parentCategoryId={parentCategoryId}
        />
      );
    }
    if (block.type === "faqs") {
      return (
        <KbPageFaqsBlockView
          block={block}
          editable={isEditMode}
          kbId={kbId}
          kbSlug={kbSlug}
        />
      );
    }
    return (
      <KbPageArticlesBlockView
        block={block}
        categories={categories}
        categoryId={parentCategoryId ?? undefined}
        editable={isEditMode}
        kbId={kbId}
        kbSlug={kbSlug}
      />
    );
  }

  return (
    <div
      className={cn(
        isContentBlock && isEditMode ? "group/block relative" : "space-y-3",
        isEditMode &&
          "rounded-md outline outline-dashed outline-1 outline-transparent transition-[outline-color] hover:outline-border/60"
      )}
    >
      {isContentBlock && isEditMode ? (
        <div className="pointer-events-none absolute top-0 right-0 z-10">
          {blockEditActions}
        </div>
      ) : null}
      {isContentBlock ? null : (
        <KbPageBlockHeader
          block={block}
          canMoveDown={blockIndex < blockCount - 1}
          canMoveUp={blockIndex > 0}
          defaultLabel={defaultLabel}
          editable={isEditMode}
          onHeadlineCommit={(headline) =>
            onLayoutPatch((prev) =>
              patchPageBlockHeadline(prev, block.id, headline)
            )
          }
          onMoveDown={() =>
            onLayoutPatch((prev) => movePageBlock(prev, block.id, 1))
          }
          onMoveUp={() =>
            onLayoutPatch((prev) => movePageBlock(prev, block.id, -1))
          }
          onOpenSettings={() => onOpenSettings(block.id)}
          onToggleVisibility={() =>
            onLayoutPatch((prev) => togglePageBlockVisibility(prev, block.id))
          }
        />
      )}
      {block.visible || isEditMode ? renderBlockContent() : null}
    </div>
  );
}
