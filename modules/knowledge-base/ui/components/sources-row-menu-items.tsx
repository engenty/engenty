import { useTranslation } from "@engenty/i18n/ui";
import { DropdownMenuItem } from "@engenty/ui-core";
import { AnimatedRefreshIcon } from "@engenty/ui-icons";
import { Edit, List, Play, Trash2 } from "lucide-react";
import type { KbSource } from "../../src/schema/types.js";

export function SourcesRowMenuItems({
  onDelete,
  onEdit,
  onOpenItems,
  onRotate,
  onRun,
  source,
}: {
  onDelete: (source: KbSource) => void;
  onEdit: (source: KbSource) => void;
  onOpenItems: (source: KbSource) => void;
  onRotate: (source: KbSource) => void;
  onRun: (source: KbSource) => void;
  source: KbSource;
}) {
  const { t } = useTranslation("kb");

  return (
    <>
      <DropdownMenuItem
        onClick={(e) => {
          e.stopPropagation();
          onRun(source);
        }}
      >
        <Play className="mr-2 h-4 w-4" />
        {t("sources.run_now")}
      </DropdownMenuItem>
      <DropdownMenuItem
        onClick={(e) => {
          e.stopPropagation();
          onOpenItems(source);
        }}
      >
        <List className="mr-2 h-4 w-4" />
        {t("sources.items")}
      </DropdownMenuItem>
      <DropdownMenuItem
        onClick={(e) => {
          e.stopPropagation();
          onEdit(source);
        }}
      >
        <Edit className="mr-2 h-4 w-4" />
        {t("article.edit")}
      </DropdownMenuItem>
      <DropdownMenuItem
        onClick={(e) => {
          e.stopPropagation();
          onRotate(source);
        }}
      >
        <AnimatedRefreshIcon className="mr-2" size="sm" />
        {t("sources.rotate_token")}
      </DropdownMenuItem>
      <DropdownMenuItem
        className="text-destructive focus:text-destructive"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(source);
        }}
      >
        <Trash2 className="mr-2 h-4 w-4" />
        {t("sources.delete")}
      </DropdownMenuItem>
    </>
  );
}
