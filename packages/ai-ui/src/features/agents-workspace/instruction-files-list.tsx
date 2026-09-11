import { cn } from "@engenty/ui-core";
import { File } from "lucide-react";
import type { AiInstructionFileDocument } from "../../lib/admin/instruction-settings-api";
import {
  hasInstructionOverride,
  type InstructionOverrideFlags,
} from "../ai-settings/instruction-groups";

interface InstructionFilesListProps {
  documents: AiInstructionFileDocument[];
  emptyLabel: string;
  onSelect: (documentKey: string) => void;
  openBadgeLabel: string;
  overrideFlagsByKey?: Map<string, InstructionOverrideFlags>;
  overrideMarkerLabel: (flags: InstructionOverrideFlags) => string;
  selectedKey: string;
}

export function InstructionFilesList({
  documents,
  emptyLabel,
  onSelect,
  openBadgeLabel,
  overrideFlagsByKey,
  overrideMarkerLabel,
  selectedKey,
}: InstructionFilesListProps) {
  if (documents.length === 0) {
    return <p className="p-1.5 text-muted-foreground text-xs">{emptyLabel}</p>;
  }

  return (
    <div className="flex flex-col gap-0.5">
      {documents.map((document) => {
        const isActive = document.document_key === selectedKey;
        const flags = overrideFlagsByKey?.get(document.document_key);
        const overridden = hasInstructionOverride(flags);
        const markerLabel = flags ? overrideMarkerLabel(flags) : "";
        return (
          <button
            aria-current={isActive ? "true" : undefined}
            className={cn(
              "flex w-full items-center gap-1.5 rounded-md px-1.5 py-1.5 text-left font-mono text-xs transition-colors",
              isActive
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            )}
            key={document.document_key}
            onClick={() => onSelect(document.document_key)}
            type="button"
          >
            <File
              aria-hidden
              className="size-3.5 shrink-0 text-muted-foreground"
            />
            <span className="min-w-0 flex-1 truncate">{document.filename}</span>
            {overridden ? (
              <>
                <span
                  aria-hidden
                  className="size-1.5 shrink-0 rounded-full bg-primary"
                  title={markerLabel}
                />
                <span className="sr-only">{markerLabel}</span>
              </>
            ) : null}
            {isActive ? (
              <span className="sr-only">{openBadgeLabel}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
