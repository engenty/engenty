/**
 * Configurable page blocks editor — hub start page + category view pages.
 */

import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@engenty/ui-core";
import { Plus } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import type { KbPageLayoutSettings } from "../../../src/schema/page-blocks.js";
import {
  addPageBlock,
  createDefaultArticlesBlock,
  createDefaultCategoriesBlock,
  createDefaultContentBlock,
  createDefaultFaqsBlock,
} from "../../../src/schema/page-blocks.js";
import type { KbCategory, KnowledgeBase } from "../../../src/schema/types.js";
import { patchPageBlock } from "../../lib/page-blocks/page-block-order.js";
import { KbPageBlockRow } from "./kb-page-block-row.js";
import { KbPageBlockSettingsDialog } from "./kb-page-block-settings-dialog.js";

export type KbPageBlocksEditorTarget =
  | { kind: "category"; category: KbCategory }
  | { kind: "hub"; kb: KnowledgeBase };

interface KbPageBlocksEditorProps {
  categories: KbCategory[];
  isEditMode: boolean;
  kbSlug: string;
  layout: KbPageLayoutSettings;
  onLayoutChange: (layout: KbPageLayoutSettings) => void;
  target: KbPageBlocksEditorTarget;
}

export function KbPageBlocksEditor({
  categories,
  isEditMode,
  kbSlug,
  layout,
  onLayoutChange,
  target,
}: KbPageBlocksEditorProps) {
  const { t } = useTranslation("kb");
  const [settingsBlockId, setSettingsBlockId] = useState<string | null>(null);

  const kbId = target.kind === "hub" ? target.kb.id : target.category.kb_id;
  const parentCategoryId =
    target.kind === "category" ? target.category.id : null;
  const categoryContext = target.kind === "category" ? target.category : null;

  const settingsBlock = useMemo(
    () => layout.blocks.find((b) => b.id === settingsBlockId) ?? null,
    [layout.blocks, settingsBlockId]
  );

  const patchLayout = useCallback(
    (updater: (prev: KbPageLayoutSettings) => KbPageLayoutSettings) => {
      onLayoutChange(updater(layout));
    },
    [layout, onLayoutChange]
  );

  return (
    <>
      <div className="space-y-8">
        {layout.blocks.map((block, index) => (
          <KbPageBlockRow
            block={block}
            blockCount={layout.blocks.length}
            blockIndex={index}
            categories={categories}
            isEditMode={isEditMode}
            kbId={kbId}
            kbSlug={kbSlug}
            key={block.id}
            onLayoutPatch={patchLayout}
            onOpenSettings={setSettingsBlockId}
            parentCategoryId={parentCategoryId}
            target={target}
          />
        ))}
      </div>

      {isEditMode ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="mt-6" size="sm" type="button" variant="outline">
              <Plus aria-hidden className="mr-1.5 h-4 w-4" />
              {t("page_blocks.add_block")}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem
              onClick={() =>
                patchLayout((prev) =>
                  addPageBlock(prev, createDefaultContentBlock())
                )
              }
            >
              {t("page_blocks.add_content")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                patchLayout((prev) =>
                  addPageBlock(prev, createDefaultCategoriesBlock())
                )
              }
            >
              {t("page_blocks.add_categories")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                patchLayout((prev) =>
                  addPageBlock(prev, createDefaultArticlesBlock())
                )
              }
            >
              {t("page_blocks.add_articles")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                patchLayout((prev) =>
                  addPageBlock(prev, createDefaultFaqsBlock())
                )
              }
            >
              {t("page_blocks.add_faqs")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}

      <KbPageBlockSettingsDialog
        block={settingsBlock}
        categories={categories}
        categoryContext={categoryContext}
        onOpenChange={(open) => {
          if (!open) {
            setSettingsBlockId(null);
          }
        }}
        onSave={(nextBlock) =>
          patchLayout((prev) => patchPageBlock(prev, nextBlock.id, nextBlock))
        }
        open={settingsBlockId !== null}
      />
    </>
  );
}
