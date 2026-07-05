// In-app PDF preview drawer for the commercial draft editors (offer/invoice).
// Ports the legacy engency pattern: a "PDF" action in the draft toolbar opens
// the rendered document beside the editor instead of a detached browser tab.
import {
  Button,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@engenty/ui-core";
import { Download } from "lucide-react";
import { useEffect, useMemo } from "react";

export interface PdfPreviewSheetProps {
  /** Rendered document; the sheet owns the object URL lifecycle. */
  blob: Blob | null;
  downloadLabel: string;
  fileName: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  title: string;
}

export function PdfPreviewSheet({
  blob,
  downloadLabel,
  fileName,
  onOpenChange,
  open,
  title,
}: PdfPreviewSheetProps) {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);
  useEffect(
    () => () => {
      if (url) {
        URL.revokeObjectURL(url);
      }
    },
    [url]
  );

  const download = () => {
    if (!url) {
      return;
    }
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.append(link);
    link.click();
    link.remove();
  };

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent
        className="flex w-full flex-col gap-3 sm:max-w-[720px]"
        side="right"
      >
        <SheetHeader className="flex-row items-center justify-between gap-2 space-y-0 pr-8">
          <SheetTitle className="truncate">{title}</SheetTitle>
          <Button onClick={download} size="sm" variant="outline">
            <Download className="mr-1.5 size-4" />
            {downloadLabel}
          </Button>
        </SheetHeader>
        {url ? (
          <iframe
            className="min-h-0 w-full flex-1 rounded border"
            src={url}
            title={title}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
