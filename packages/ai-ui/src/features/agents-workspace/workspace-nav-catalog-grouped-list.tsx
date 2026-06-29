import type { LucideIcon } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import type { CatalogModuleFolder } from "./workspace-catalog-partition";
import { WorkspaceNavModuleFolder } from "./workspace-nav-module-folder";

function catalogNavRowKey(item: { id?: string; name: string }): string {
  return item.id ?? item.name;
}

export function WorkspaceNavCatalogGroupedList<
  T extends { id?: string; name: string },
>({
  emptyLabel,
  folders,
  getFolderIcon,
  getFolderLabel,
  forceModuleFoldersOpen = false,
  isFolderOpen,
  loading,
  loadingLabel,
  newRow,
  renderItem,
  root,
  section,
  toggleFolder,
}: {
  emptyLabel: string;
  folders: CatalogModuleFolder<T>[];
  forceModuleFoldersOpen?: boolean;
  getFolderIcon?: (folder: CatalogModuleFolder<T>) => LucideIcon | undefined;
  getFolderLabel?: (folder: CatalogModuleFolder<T>) => string | undefined;
  isFolderOpen: (section: "actions" | "skills", moduleId: string) => boolean;
  loading: boolean;
  loadingLabel: string;
  newRow: ReactNode;
  renderItem: (item: T) => ReactNode;
  root: T[];
  section: "actions" | "skills";
  toggleFolder: (section: "actions" | "skills", moduleId: string) => void;
}) {
  return (
    <>
      {loading ? (
        <p className="px-2 py-1 text-[11px] text-muted-foreground leading-snug">
          {loadingLabel}
        </p>
      ) : null}
      {!loading && root.length === 0 && folders.length === 0 ? (
        <p className="px-2 py-1 text-[11px] text-muted-foreground leading-snug">
          {emptyLabel}
        </p>
      ) : null}
      {root.map((item) => (
        <Fragment key={catalogNavRowKey(item)}>{renderItem(item)}</Fragment>
      ))}
      {folders.map(({ items, moduleId }) => (
        <WorkspaceNavModuleFolder
          icon={getFolderIcon?.({ items, moduleId })}
          key={moduleId}
          label={getFolderLabel?.({ items, moduleId })}
          moduleId={moduleId}
          onToggle={() => toggleFolder(section, moduleId)}
          open={forceModuleFoldersOpen ? true : isFolderOpen(section, moduleId)}
        >
          {items.map((item) => (
            <Fragment key={catalogNavRowKey(item)}>{renderItem(item)}</Fragment>
          ))}
        </WorkspaceNavModuleFolder>
      ))}
      {newRow}
    </>
  );
}
