import {
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@engenty/ui-core";
import { Check, ChevronDown, FileText } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SkillDetailFileEntry } from "./skill-detail-file-entries.js";

const HOVER_CLOSE_MS = 220;

interface SkillDetailFileChooserProps {
  chooseFileAriaLabel: string;
  className?: string;
  files: SkillDetailFileEntry[];
  onSelectFile: (filePath: string) => void;
  selectedFile: string;
  selectedLabel?: string;
}

export function SkillDetailFileChooser({
  className,
  files,
  onSelectFile,
  selectedFile,
  selectedLabel,
  chooseFileAriaLabel,
}: SkillDetailFileChooserProps) {
  const [open, setOpen] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const effectiveFiles =
    files.length > 0
      ? files
      : selectedFile
        ? [{ label: selectedFile, path: selectedFile }]
        : [];

  const cancelScheduledClose = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    cancelScheduledClose();
    closeTimerRef.current = setTimeout(() => {
      setOpen(false);
      closeTimerRef.current = null;
    }, HOVER_CLOSE_MS);
  }, [cancelScheduledClose]);

  const handleOpen = useCallback(() => {
    cancelScheduledClose();
    setOpen(true);
  }, [cancelScheduledClose]);

  useEffect(
    () => () => {
      cancelScheduledClose();
    },
    [cancelScheduledClose]
  );

  return (
    <div
      className={cn("relative min-w-0", className)}
      onMouseEnter={handleOpen}
      onMouseLeave={scheduleClose}
    >
      <DropdownMenu
        modal={false}
        onOpenChange={(next) => {
          if (!next) {
            cancelScheduledClose();
          }
          setOpen(next);
        }}
        open={open}
      >
        <DropdownMenuTrigger asChild>
          <button
            aria-expanded={open}
            aria-haspopup="menu"
            aria-label={chooseFileAriaLabel}
            className={cn(
              "group flex min-w-0 max-w-full items-center gap-2 rounded-md px-2 py-2 text-left font-semibold text-foreground text-sm transition-colors",
              "hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            )}
            type="button"
          >
            <FileText
              aria-hidden
              className="size-4 shrink-0 text-muted-foreground"
              strokeWidth={1.5}
            />
            <span className="min-w-0 flex-1 truncate">
              {selectedLabel ?? selectedFile}
            </span>
            <ChevronDown
              aria-hidden
              className={cn(
                "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
                open && "rotate-180"
              )}
              strokeWidth={1.75}
            />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="min-w-[14rem]"
          onPointerEnter={handleOpen}
          onPointerLeave={scheduleClose}
          side="bottom"
          sideOffset={4}
        >
          {effectiveFiles.map((file) => {
            const isActive = selectedFile === file.path;
            return (
              <DropdownMenuItem
                className="gap-2"
                key={file.path}
                onSelect={() => {
                  onSelectFile(file.path);
                  setOpen(false);
                }}
              >
                <FileText
                  aria-hidden
                  className="size-4 shrink-0 opacity-70"
                  strokeWidth={1.5}
                />
                <span className="min-w-0 flex-1">{file.label}</span>
                {isActive ? (
                  <Check
                    aria-hidden
                    className="size-4 shrink-0 text-primary"
                    strokeWidth={2}
                  />
                ) : null}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
