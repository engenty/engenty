import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@engenty/ui-core";
import { AnimatedDownloadIcon } from "@engenty/ui-icons";
import { EyeOff, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Document, Page } from "react-pdf";
import "../pdf-worker.js";
import type { PdfTemplatePreviewRecordOption } from "../types.js";
import { CodeEditor } from "./code-editor.js";

export type PreviewMode = "data" | "pdf" | "xml";

interface PreviewPaneProps {
  mode: PreviewMode;
  onDownload: () => Promise<void>;
  onModeChange: (value: PreviewMode) => void;
  onPreviewSourceChange: (value: string) => void;
  onRefresh: () => Promise<void>;
  onToggle: () => void;
  pdfUrl: string | null;
  previewData: Record<string, unknown> | null;
  previewOptions: PdfTemplatePreviewRecordOption[];
  renderedXml: string;
  selectedPreviewSource: string;
}

export function PreviewPane({
  mode,
  onDownload,
  onModeChange,
  onPreviewSourceChange,
  onRefresh,
  onToggle,
  pdfUrl,
  previewData,
  previewOptions,
  renderedXml,
  selectedPreviewSource,
}: PreviewPaneProps) {
  const previewContainerRef = useRef<HTMLDivElement | null>(null);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [previewWidth, setPreviewWidth] = useState(800);

  useEffect(() => {
    setNumPages(null);
  }, [pdfUrl]);

  useEffect(() => {
    const el = previewContainerRef.current;
    if (!el) {
      return;
    }
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        // Reserve 24px margin each side (p-6 on wrapper) = 48px total
        const available = Math.floor(entry.contentRect.width - 48);
        const w = Math.max(320, Math.min(1400, available));
        setPreviewWidth(w);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="ui-card-elevated flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b px-2 py-1.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <Select
            onValueChange={(value) => onModeChange(value as PreviewMode)}
            value={mode}
          >
            <SelectTrigger size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pdf">PDF</SelectItem>
              <SelectItem value="data">Data</SelectItem>
              <SelectItem value="xml">XML</SelectItem>
            </SelectContent>
          </Select>

          <Select
            onValueChange={onPreviewSourceChange}
            value={selectedPreviewSource}
          >
            <SelectTrigger size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sample">Sample Data</SelectItem>
              {previewOptions.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-0.5">
          <Button
            className="h-8 w-8"
            onClick={() => void onDownload()}
            size="icon"
            variant="ghost"
          >
            <AnimatedDownloadIcon label="Download" size="sm" />
          </Button>
          <Button
            className="h-8 w-8"
            onClick={() => void onRefresh()}
            size="icon"
            variant="ghost"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <Button
            className="h-8 w-8"
            onClick={onToggle}
            size="icon"
            variant="ghost"
          >
            <EyeOff className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden" ref={previewContainerRef}>
        {mode === "pdf" ? (
          pdfUrl ? (
            <div className="flex h-full min-h-0 flex-col overflow-y-auto overflow-x-hidden bg-neutral-200">
              <div
                className="mx-auto flex flex-col gap-6 px-6 py-6"
                style={{ width: previewWidth + 48 }}
              >
                <Document
                  file={pdfUrl}
                  key={pdfUrl}
                  onLoadError={(error: unknown) => {
                    const msg =
                      error instanceof Error ? error.message : String(error);
                    if (msg.includes("sendWithPromise")) {
                      return;
                    }
                    console.error("[PDF Preview] Load error:", error);
                  }}
                  onLoadSuccess={({ numPages: n }) => setNumPages(n ?? null)}
                >
                  {Array.from(new Array(numPages ?? 1), (_, i) => (
                    <div
                      className="mb-6 bg-white shadow-2xl last:mb-0"
                      key={`page-wrap-${i + 1}`}
                    >
                      <Page
                        key={`page_${i + 1}`}
                        pageNumber={i + 1}
                        renderAnnotationLayer
                        renderTextLayer
                        width={previewWidth}
                      />
                    </div>
                  ))}
                </Document>
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
              No preview yet.
            </div>
          )
        ) : mode === "data" ? (
          <CodeEditor
            language="json"
            onChange={() => {}}
            readOnly
            value={JSON.stringify(previewData ?? {}, null, 2)}
          />
        ) : (
          <CodeEditor
            language="xml"
            onChange={() => {}}
            readOnly
            value={renderedXml}
          />
        )}
      </div>
    </div>
  );
}
