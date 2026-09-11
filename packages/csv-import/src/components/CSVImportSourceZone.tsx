import { Button, cn, Textarea } from "@engenty/ui-core";
import { AnimatedLoaderIcon } from "@engenty/ui-icons";
import { ArrowLeft, Upload } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

const PASTED_FILENAME = "clipboard.tsv";
const ZONE_MIN_HEIGHT_CLASS = "min-h-[340px]";

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable) {
    return true;
  }
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

function isApplePlatform(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }
  return /mac|iphone|ipad|ipod/i.test(
    navigator.platform || navigator.userAgent
  );
}

interface CSVImportSourceZoneProps {
  backLabel: string;
  errorEmptyPaste: string;
  errorInvalidFile: string;
  isLoading?: boolean;
  onError?: (message: string) => void;
  onFileLoaded: (content: string, filename: string) => void;
  pasteActionLabel: string;
  pasteContinueLabel: string;
  pasteHint: string;
  pastePlaceholder: string;
  processingLabel: string;
  selectFileLabel: string;
  uploadHint: string;
  uploadTitle: string;
}

export function CSVImportSourceZone({
  backLabel,
  errorEmptyPaste,
  errorInvalidFile,
  isLoading,
  onError,
  onFileLoaded,
  pasteActionLabel,
  pasteContinueLabel,
  pasteHint,
  pastePlaceholder,
  processingLabel,
  selectFileLabel,
  uploadHint,
  uploadTitle,
}: CSVImportSourceZoneProps) {
  const fileInputId = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pasteMode, setPasteMode] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [text, setText] = useState("");

  const shortcutLabel = useMemo(
    () => (isApplePlatform() ? "⌘V" : "Ctrl+V"),
    []
  );

  const readFile = useCallback(
    (file: File) => {
      const lower = file.name.toLowerCase();
      if (
        !(
          lower.endsWith(".csv") ||
          lower.endsWith(".tsv") ||
          lower.endsWith(".txt")
        )
      ) {
        onError?.(errorInvalidFile);
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = (e.target?.result as string) || "";
        onFileLoaded(content, file.name);
      };
      reader.onerror = () => {
        onError?.(errorInvalidFile);
      };
      reader.readAsText(file);
    },
    [errorInvalidFile, onError, onFileLoaded]
  );

  const submitText = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) {
        onError?.(errorEmptyPaste);
        return;
      }
      onFileLoaded(trimmed, PASTED_FILENAME);
    },
    [errorEmptyPaste, onError, onFileLoaded]
  );

  const enterPasteMode = useCallback(() => {
    setPasteMode(true);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  }, []);

  const exitPasteMode = useCallback(() => {
    setPasteMode(false);
    setText("");
  }, []);

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (isLoading) {
        return;
      }

      const target = event.target;
      // In paste mode, let the textarea receive native paste for editing.
      if (pasteMode && target === textareaRef.current) {
        return;
      }
      if (isEditableTarget(target)) {
        return;
      }

      const clipboardData = event.clipboardData;
      if (!clipboardData) {
        return;
      }

      const files = clipboardData.files;
      if (files?.length) {
        const file = files[0];
        if (file) {
          event.preventDefault();
          readFile(file);
          return;
        }
      }

      const pasted = clipboardData.getData("text").trim();
      if (!pasted) {
        return;
      }

      event.preventDefault();
      if (pasteMode) {
        setText(pasted);
        return;
      }
      submitText(pasted);
    };

    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [isLoading, pasteMode, readFile, submitText]);

  if (isLoading) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center rounded-lg border-2 border-muted-foreground/25 border-dashed px-6 py-12",
          ZONE_MIN_HEIGHT_CLASS
        )}
      >
        <AnimatedLoaderIcon
          className="mb-4 text-primary"
          play="always"
          size={48}
        />
        <h3 className="font-semibold text-lg">{processingLabel}</h3>
      </div>
    );
  }

  if (pasteMode) {
    return (
      <div
        className={cn(
          "ui-card-panel flex flex-col gap-3 p-4",
          ZONE_MIN_HEIGHT_CLASS
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <Button
            onClick={exitPasteMode}
            size="sm"
            type="button"
            variant="ghost"
          >
            <ArrowLeft className="size-4" />
            {backLabel}
          </Button>
          <Button
            onClick={() => submitText(text)}
            size="sm"
            type="button"
            variant="outline"
          >
            {pasteContinueLabel}
          </Button>
        </div>
        <Textarea
          aria-label={pasteActionLabel}
          className="min-h-[200px] flex-1 resize-none font-mono text-xs"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              exitPasteMode();
              return;
            }
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submitText(text);
            }
          }}
          placeholder={pastePlaceholder}
          ref={textareaRef}
          value={text}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-lg border-2 border-dashed",
        ZONE_MIN_HEIGHT_CLASS,
        isDragging
          ? "border-primary bg-primary/5"
          : "border-muted-foreground/25"
      )}
      onDragLeave={() => setIsDragging(false)}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) {
          readFile(file);
        }
      }}
    >
      <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 pt-10 pb-10">
        <Upload className="size-12 text-muted-foreground" />
        <div className="space-y-1.5 text-center">
          <h3 className="font-semibold text-lg">{uploadTitle}</h3>
          <p className="text-muted-foreground text-sm">{uploadHint}</p>
        </div>

        <Button
          onClick={() => fileInputRef.current?.click()}
          type="button"
          variant="outline"
        >
          {selectFileLabel}
        </Button>
      </div>

      <div className="w-full px-4 pt-2 pb-4">
        <button
          aria-label={`${shortcutLabel} ${pasteActionLabel}`}
          className={cn(
            "relative flex h-[3.25rem] w-full cursor-text items-center overflow-hidden rounded-md border border-input bg-card px-3 text-left shadow-xs",
            "outline-none transition-[border-color,box-shadow]",
            "hover:border-ring/60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          )}
          onClick={enterPasteMode}
          type="button"
        >
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 flex select-none items-center justify-center"
          >
            <span className="font-semibold text-3xl text-muted-foreground/20 tracking-tight">
              {shortcutLabel}
            </span>
          </span>
          <span className="relative z-10 text-muted-foreground text-sm">
            {pasteHint}
          </span>
        </button>
      </div>

      <input
        accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
        className="hidden"
        id={fileInputId}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            readFile(file);
          }
          e.target.value = "";
        }}
        ref={fileInputRef}
        type="file"
      />
    </div>
  );
}
