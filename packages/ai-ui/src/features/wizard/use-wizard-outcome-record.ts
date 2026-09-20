"use client";

import { formatObjectRef } from "@engenty/ai-core/browser";
import { useEffect, useMemo, useRef } from "react";
import { openObjectPaneTab } from "../../artifacts/artifact-store.js";
import { objectRefLinksInMarkdown } from "../../objects/object-ref-links.js";
import { useObjectWidgets } from "../../objects/object-widget-registry.js";

/**
 * The record a settled run wrote, opened in the host's pane.
 *
 * A wizard whose result is a module record says so in its closing line, as a
 * markdown link the module's widget can read back (`matchHref`). Rather than
 * making the person follow it and leave the run, the record opens beside
 * what they were reading — the wizard page's pane, or the desk's. Opened once
 * per record, so closing the pane keeps it closed.
 */
export function useWizardOutcomeRecord(input: {
  hostKey?: string | null;
  settled: boolean;
  summary?: string | null;
}) {
  const widgets = useObjectWidgets();
  const link = useMemo(() => {
    const text = input.summary ?? "";
    return text
      ? (objectRefLinksInMarkdown(text, widgets, 1)[0] ?? null)
      : null;
  }, [input.summary, widgets]);
  const opened = useRef<string | null>(null);
  const hostKey = input.hostKey ?? null;
  const settled = input.settled;

  useEffect(() => {
    if (!(hostKey && settled && link)) {
      return;
    }
    const key = formatObjectRef(link.ref);
    if (opened.current === key) {
      return;
    }
    opened.current = key;
    openObjectPaneTab(hostKey, link.ref, { title: link.title });
  }, [hostKey, link, settled]);
}
