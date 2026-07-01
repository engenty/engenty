import { Folder, LayoutList } from "lucide-react";
import type { KbCategory } from "../../src/schema/types.js";

/** Sidebar leading glyph — custom emoji when set, otherwise folder/collection icon. */
export function CategorySidebarLeadingIcon({
  category,
}: {
  category: KbCategory;
}) {
  const icon = category.icon?.trim();
  if (icon) {
    return (
      <span aria-hidden className="select-none text-sm leading-none">
        {icon}
      </span>
    );
  }
  return category.view_type === "folder" ? (
    <Folder aria-hidden />
  ) : (
    <LayoutList aria-hidden />
  );
}
