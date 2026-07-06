// In-app PDF preview drawer for the commercial draft editors (offer/invoice).
// Ports the legacy engency pattern: a "PDF" action in the draft toolbar opens
// the rendered document beside the editor instead of a detached browser tab.
// The sheet is drag-resizable on its left edge; the width sticks per browser.
import {
  Button,
  cn,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@engenty/ui-core";
import { Download } from "lucide-react";
import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export interface PdfPreviewSheetProps {
  /** Rendered document; the sheet owns the object URL lifecycle. */
  blob: Blob | null;
  downloadLabel: string;
  fileName: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  title: string;
}

const WIDTH_STORAGE_KEY = "engenty.pdf-preview-sheet.width";
const MIN_WIDTH = 480;
// Wide enough for an A4 page at a readable zoom.
const DEFAULT_WIDTH = 980;

function clampWidth(width: number): number {
  const max = Math.floor(window.innerWidth * 0.95);
  return Math.min(Math.max(width, MIN_WIDTH), max);
}

function initialWidth(): number {
  if (typeof window === "undefined") {
    return DEFAULT_WIDTH;
  }
  const stored = Number(window.localStorage.getItem(WIDTH_STORAGE_KEY));
  return clampWidth(
    Number.isFinite(stored) && stored > 0 ? stored : DEFAULT_WIDTH
  );
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

  const [width, setWidth] = useState(initialWidth);
  const [resizing, setResizing] = useState(false);
  const frame = useRef(0);

  const startResize = useCallback((event: ReactPointerEvent) => {
    event.preventDefault();
    setResizing(true);
    const onMove = (move: PointerEvent) => {
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => {
        setWidth(clampWidth(window.innerWidth - move.clientX));
      });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setResizing(false);
      setWidth((current) => {
        window.localStorage.setItem(WIDTH_STORAGE_KEY, String(current));
        return current;
      });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, []);

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
        className="flex w-full flex-col gap-3"
        side="right"
        // Inline style beats the default `sm:max-w-*` utilities, so the
        // dragged width applies at every breakpoint.
        style={{ maxWidth: "95vw", width }}
      >
        {/* Left-edge resize handle. */}
        <div
          aria-hidden
          className={cn(
            "absolute inset-y-0 -left-1 z-10 w-2 cursor-col-resize transition-colors hover:bg-primary/30",
            resizing && "bg-primary/30"
          )}
          onPointerDown={startResize}
        />
        <SheetHeader className="flex-row items-center justify-between gap-2 space-y-0 pr-8">
          <SheetTitle className="truncate">{title}</SheetTitle>
          <Button onClick={download} size="sm" variant="outline">
            <Download className="mr-1.5 size-4" />
            {downloadLabel}
          </Button>
        </SheetHeader>
        {url ? (
          <iframe
            className={cn(
              "min-h-0 w-full flex-1 rounded border",
              // The iframe swallows pointer events and would kill the drag.
              resizing && "pointer-events-none"
            )}
            src={url}
            title={title}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
