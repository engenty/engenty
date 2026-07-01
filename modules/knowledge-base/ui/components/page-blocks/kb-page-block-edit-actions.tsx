/**
 * Shared edit-mode controls for page blocks (reorder, visibility, settings).
 */

import { useTranslation } from "@engenty/i18n/ui";
import { Button, cn } from "@engenty/ui-core";
import { ChevronDown, ChevronUp, Eye, EyeOff } from "lucide-react";

export interface KbPageBlockEditActionsProps {
  canMoveDown: boolean;
  canMoveUp: boolean;
  className?: string;
  onMoveDown: () => void;
  onMoveUp: () => void;
  onOpenSettings?: () => void;
  onToggleVisibility: () => void;
  showSettings?: boolean;
  visible: boolean;
}

export function KbPageBlockEditActions({
  canMoveDown,
  canMoveUp,
  className,
  onMoveDown,
  onMoveUp,
  onOpenSettings,
  onToggleVisibility,
  showSettings = false,
  visible,
}: KbPageBlockEditActionsProps) {
  const { t } = useTranslation("kb");

  return (
    <div className={cn("flex shrink-0 items-center gap-0.5", className)}>
      <Button
        aria-label={t("page_blocks.move_up")}
        className="h-7 w-7 p-0 text-muted-foreground"
        disabled={!canMoveUp}
        onClick={onMoveUp}
        size="sm"
        type="button"
        variant="ghost"
      >
        <ChevronUp aria-hidden className="h-4 w-4" />
      </Button>
      <Button
        aria-label={t("page_blocks.move_down")}
        className="h-7 w-7 p-0 text-muted-foreground"
        disabled={!canMoveDown}
        onClick={onMoveDown}
        size="sm"
        type="button"
        variant="ghost"
      >
        <ChevronDown aria-hidden className="h-4 w-4" />
      </Button>
      <Button
        aria-label={visible ? t("page_blocks.hide") : t("page_blocks.show")}
        className="h-7 w-7 p-0 text-muted-foreground"
        onClick={onToggleVisibility}
        size="sm"
        type="button"
        variant="ghost"
      >
        {visible ? (
          <Eye aria-hidden className="h-4 w-4" />
        ) : (
          <EyeOff aria-hidden className="h-4 w-4" />
        )}
      </Button>
      {showSettings && onOpenSettings ? (
        <Button
          className="h-7 px-2 text-muted-foreground text-xs"
          onClick={onOpenSettings}
          size="sm"
          type="button"
          variant="ghost"
        >
          {t("page_blocks.settings")}
        </Button>
      ) : null}
    </div>
  );
}
