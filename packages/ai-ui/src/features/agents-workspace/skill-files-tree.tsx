import { cn } from "@engenty/ui-core";
import { File, Folder } from "lucide-react";
import {
  groupSkillDetailFiles,
  type SkillDetailFileEntry,
} from "./skill-detail-file-entries.js";

interface SkillFilesTreeProps {
  emptyLabel: string;
  files: SkillDetailFileEntry[];
  onSelect: (path: string) => void;
  openBadgeLabel: string;
  selectedPath: string;
}

export function SkillFilesTree({
  emptyLabel,
  files,
  onSelect,
  openBadgeLabel,
  selectedPath,
}: SkillFilesTreeProps) {
  const groups = groupSkillDetailFiles(files);

  if (files.length === 0) {
    return <p className="p-1.5 text-muted-foreground text-xs">{emptyLabel}</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {groups.map((group) => (
        <section className="flex flex-col gap-0.5" key={group.folder ?? ""}>
          {group.folder ? (
            <div className="flex items-center gap-1.5 px-1.5 py-1 font-mono text-muted-foreground text-xs">
              <Folder aria-hidden className="size-3.5 shrink-0" />
              <span className="min-w-0 truncate">{group.folder}</span>
            </div>
          ) : null}
          {group.files.map((file) => {
            const isActive = file.path === selectedPath;
            return (
              <button
                aria-current={isActive ? "true" : undefined}
                className={cn(
                  "flex w-full items-center gap-1.5 rounded-md px-1.5 py-1.5 text-left font-mono text-xs transition-colors",
                  group.folder ? "pl-5" : "",
                  isActive
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                )}
                key={file.path}
                onClick={() => onSelect(file.path)}
                type="button"
              >
                <File
                  aria-hidden
                  className="size-3.5 shrink-0 text-muted-foreground"
                />
                <span className="min-w-0 flex-1 truncate">{file.label}</span>
                {isActive ? (
                  <span className="sr-only">{openBadgeLabel}</span>
                ) : null}
              </button>
            );
          })}
        </section>
      ))}
    </div>
  );
}
