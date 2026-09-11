import type { MarkdownReadingStyle } from "@engenty/ai-ui";
import { MarkdownReadingStyleSegment } from "@engenty/ai-ui";
import { DropdownMenuItem, DropdownMenuSeparator } from "@engenty/ui-core";
import {
  ClipboardCopy,
  Copy,
  FileText,
  FolderInput,
  History,
  Link2,
  Printer,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import type { MarkdownPageOverflowLabels } from "./markdown-page-labels";
import { SpaceArtifactPinMenuItem } from "./space-artifact-pin-menu-item";

export function downloadMarkdownFile(title: string, content: string): void {
  const slug =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 64) || "page";
  const url = URL.createObjectURL(
    new Blob([content], { type: "text/markdown;charset=utf-8" })
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${slug}.md`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function MarkdownPageMenuItems({
  artifactId,
  content,
  duplicatePending,
  labels,
  onCopyLink,
  onDelete,
  onDuplicate,
  onMove,
  onOpenHistory,
  onReadingStyleChange,
  readingStyle,
  spaceId,
  title,
}: {
  artifactId: string;
  content: string;
  duplicatePending: boolean;
  labels: MarkdownPageOverflowLabels;
  onCopyLink: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMove: () => void;
  onOpenHistory: () => void;
  onReadingStyleChange: (style: MarkdownReadingStyle) => void;
  readingStyle: MarkdownReadingStyle;
  spaceId: string | null;
  title: string;
}) {
  return (
    <>
      <MarkdownReadingStyleSegment
        labels={{
          large: labels.readingLarge,
          normal: labels.readingNormal,
          tone: labels.readingTone,
        }}
        onChange={onReadingStyleChange}
        value={readingStyle}
      />
      <DropdownMenuSeparator />
      <SpaceArtifactPinMenuItem artifactId={artifactId} spaceId={spaceId} />
      <DropdownMenuItem onSelect={onOpenHistory}>
        <History className="mr-2 h-4 w-4 opacity-70" />
        {labels.history}
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => downloadMarkdownFile(title, content)}>
        <FileText className="mr-2 h-4 w-4 opacity-70" />
        {labels.exportMarkdown}
      </DropdownMenuItem>
      <DropdownMenuItem
        onSelect={() => {
          void navigator.clipboard.writeText(content).then(
            () => toast.success(labels.copyContentSuccess),
            () => toast.error(labels.copyContentFailed)
          );
        }}
      >
        <ClipboardCopy className="mr-2 h-4 w-4 opacity-70" />
        {labels.copyContent}
      </DropdownMenuItem>
      <DropdownMenuItem
        onSelect={() => {
          toast.info(labels.printHint);
          window.requestAnimationFrame(() => window.print());
        }}
      >
        <Printer className="mr-2 h-4 w-4 opacity-70" />
        {labels.print}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={() => onCopyLink()}>
        <Link2 className="mr-2 h-4 w-4 opacity-70" />
        {labels.copyLink}
      </DropdownMenuItem>
      <DropdownMenuItem
        disabled={duplicatePending}
        onSelect={() => onDuplicate()}
      >
        <Copy className="mr-2 h-4 w-4 opacity-70" />
        {labels.duplicate}
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={onMove}>
        <FolderInput className="mr-2 h-4 w-4 opacity-70" />
        {labels.move}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        className="text-destructive focus:bg-destructive/10 focus:text-destructive"
        onSelect={onDelete}
      >
        <Trash2 className="mr-2 h-4 w-4 opacity-70" />
        {labels.delete}
      </DropdownMenuItem>
    </>
  );
}
