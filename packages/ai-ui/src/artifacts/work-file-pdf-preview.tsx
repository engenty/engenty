"use client";

import { Tabs, TabsList, TabsTrigger } from "@engenty/ui-core";
import { useState } from "react";
import { WorkFileExtractedPreview } from "./work-file-extracted-preview.js";
import { WorkFileReparseMenu } from "./work-file-reparse-menu.js";

type PdfPreviewTab = "original" | "parsed";

export function WorkFilePdfPreview({
  filename,
  labels,
  storageKey,
  url,
}: {
  filename: string;
  labels: {
    extractedTextLoading: string;
    noExtractedText: string;
    original: string;
    parsed: string;
    truncated: string;
  };
  storageKey: string;
  url: string;
}) {
  const [tab, setTab] = useState<PdfPreviewTab>("original");
  const [reparsing, setReparsing] = useState(false);
  const [reparseError, setReparseError] = useState<string | null>(null);

  return (
    <Tabs
      className="flex min-h-0 flex-1 flex-col gap-0"
      onValueChange={(value) => {
        if (value === "original" || value === "parsed") {
          setTab(value);
        }
      }}
      value={tab}
    >
      <div className="flex h-9 shrink-0 items-center border-border-soft border-b">
        <TabsList
          className="h-9 min-w-0 flex-1 justify-start rounded-none bg-transparent px-1.5"
          variant="line"
        >
          <TabsTrigger className="flex-none" value="original">
            {labels.original}
          </TabsTrigger>
          <TabsTrigger className="flex-none" value="parsed">
            {labels.parsed}
          </TabsTrigger>
        </TabsList>
        <div className="shrink-0 pr-1">
          <WorkFileReparseMenu
            filename={filename}
            onError={setReparseError}
            onFinished={() => setReparsing(false)}
            onStarted={() => {
              setReparsing(true);
              setTab("parsed");
            }}
            storageKey={storageKey}
          />
        </div>
      </div>
      {reparseError ? (
        <p className="shrink-0 border-border-soft border-b px-3 py-1.5 text-destructive text-xs">
          {reparseError}
        </p>
      ) : null}
      <div
        className={
          tab === "original" ? "min-h-0 flex-1 overflow-hidden p-4" : "hidden"
        }
      >
        <iframe
          className="ui-card-panel h-full min-h-[20rem] w-full"
          src={url}
          title={filename}
        />
      </div>
      <div
        className={
          tab === "parsed"
            ? "flex min-h-0 flex-1 flex-col overflow-hidden"
            : "hidden"
        }
      >
        <WorkFileExtractedPreview
          labels={{
            extractedTextLoading: labels.extractedTextLoading,
            noExtractedText: labels.noExtractedText,
            truncated: labels.truncated,
          }}
          refreshing={reparsing}
          storageKey={storageKey}
        />
      </div>
    </Tabs>
  );
}
