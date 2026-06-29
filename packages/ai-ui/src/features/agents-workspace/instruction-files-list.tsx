import { cn } from "@engenty/ui-core";
import { FileText } from "lucide-react";
import type { AiInstructionFileDocument } from "../../lib/admin/instruction-settings-api";

interface InstructionFilesListProps {
  documents: AiInstructionFileDocument[];
  emptyLabel: string;
  onSelect: (documentKey: string) => void;
  openBadgeLabel: string;
  selectedKey: string;
}

function formatBodyByteLength(body: string): string {
  const bytes = new TextEncoder().encode(body).length;
  if (bytes >= 10_240) {
    return `${Math.round(bytes / 1024)}K`;
  }
  return `${bytes}B`;
}

export function InstructionFilesList({
  documents,
  emptyLabel,
  onSelect,
  openBadgeLabel,
  selectedKey,
}: InstructionFilesListProps) {
  if (documents.length === 0) {
    return (
      <p className="px-2 py-1 text-muted-foreground text-sm">{emptyLabel}</p>
    );
  }

  return (
    <div className="flex flex-col gap-0.5 pr-1">
      {documents.map((document) => {
        const isActive = document.document_key === selectedKey;
        return (
          <button
            aria-current={isActive ? "true" : undefined}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors",
              isActive
                ? "bg-muted/70 text-foreground"
                : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
            )}
            key={document.document_key}
            onClick={() => onSelect(document.document_key)}
            type="button"
          >
            <FileText
              aria-hidden
              className={cn(
                "size-4 shrink-0",
                isActive ? "text-foreground" : "text-muted-foreground"
              )}
              strokeWidth={1.5}
            />
            <span className="min-w-0 flex-1 truncate font-medium text-[11px] uppercase tracking-wide">
              {document.filename}
            </span>
            <span
              className={cn(
                "shrink-0 rounded border px-1.5 py-0.5 font-semibold text-xxs uppercase tracking-wide",
                isActive
                  ? "border-border/80 text-foreground"
                  : "border-border/60 text-muted-foreground"
              )}
            >
              {isActive ? openBadgeLabel : formatBodyByteLength(document.body)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
