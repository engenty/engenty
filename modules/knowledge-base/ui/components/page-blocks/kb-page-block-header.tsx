/**
 * Edit-mode block chrome — reorder, visibility, settings.
 */

import { cn } from "@engenty/ui-core";
import type { KbPageBlock } from "../../../src/schema/page-blocks.js";
import { KbPageBlockEditActions } from "./kb-page-block-edit-actions.js";
import { KbPageBlockHeadline } from "./kb-page-block-headline.js";

export interface KbPageBlockHeaderProps {
  block: KbPageBlock;
  canMoveDown: boolean;
  canMoveUp: boolean;
  defaultLabel: string;
  editable?: boolean;
  onHeadlineCommit: (headline: string | null) => void;
  onMoveDown: () => void;
  onMoveUp: () => void;
  onOpenSettings: () => void;
  onToggleVisibility: () => void;
}

export function KbPageBlockHeader({
  block,
  canMoveDown,
  canMoveUp,
  defaultLabel,
  editable = false,
  onMoveDown,
  onMoveUp,
  onOpenSettings,
  onHeadlineCommit,
  onToggleVisibility,
}: KbPageBlockHeaderProps) {
  if (block.type === "content") {
    return null;
  }

  if (!editable) {
    return (
      <KbPageBlockHeadline
        defaultLabel={defaultLabel}
        editable={false}
        headline={block.headline}
        onCommit={onHeadlineCommit}
      />
    );
  }

  return (
    <div className="group flex min-w-0 items-center gap-2">
      <div className={cn("min-w-0 flex-1", !block.visible && "opacity-60")}>
        <KbPageBlockHeadline
          defaultLabel={defaultLabel}
          editable
          headline={block.headline}
          onCommit={onHeadlineCommit}
        />
      </div>
      <KbPageBlockEditActions
        canMoveDown={canMoveDown}
        canMoveUp={canMoveUp}
        className="opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
        onMoveDown={onMoveDown}
        onMoveUp={onMoveUp}
        onOpenSettings={onOpenSettings}
        onToggleVisibility={onToggleVisibility}
        showSettings
        visible={block.visible}
      />
    </div>
  );
}
