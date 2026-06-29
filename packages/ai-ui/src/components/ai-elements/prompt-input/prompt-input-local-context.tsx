"use client";

import { DropdownMenuItem } from "@engenty/ui-core";
import type { SourceDocumentUIPart } from "ai";
import { ImageIcon } from "lucide-react";
import type { ComponentProps } from "react";
import { createContext, useCallback, useContext } from "react";
import {
  type AttachmentsContext,
  useOptionalProviderAttachments,
} from "./prompt-input-provider.js";

export const LocalAttachmentsContext = createContext<AttachmentsContext | null>(
  null
);

export const usePromptInputAttachments = () => {
  // Prefer local context (inside PromptInput) as it has validation, fall back to provider
  const provider = useOptionalProviderAttachments();
  const local = useContext(LocalAttachmentsContext);
  const context = local ?? provider;
  if (!context) {
    throw new Error(
      "usePromptInputAttachments must be used within a PromptInput or PromptInputProvider"
    );
  }
  return context;
};

// ============================================================================
// Referenced Sources (Local to PromptInput)
// ============================================================================

export interface ReferencedSourcesContext {
  add: (sources: SourceDocumentUIPart[] | SourceDocumentUIPart) => void;
  clear: () => void;
  remove: (id: string) => void;
  sources: (SourceDocumentUIPart & { id: string })[];
}

export const LocalReferencedSourcesContext =
  createContext<ReferencedSourcesContext | null>(null);

export const usePromptInputReferencedSources = () => {
  const ctx = useContext(LocalReferencedSourcesContext);
  if (!ctx) {
    throw new Error(
      "usePromptInputReferencedSources must be used within a LocalReferencedSourcesContext.Provider"
    );
  }
  return ctx;
};

export type PromptInputActionAddAttachmentsProps = ComponentProps<
  typeof DropdownMenuItem
> & {
  label?: string;
};

export const PromptInputActionAddAttachments = ({
  label = "Add photos or files",
  ...props
}: PromptInputActionAddAttachmentsProps) => {
  const attachments = usePromptInputAttachments();

  const handleSelect = useCallback(
    (e: Event) => {
      e.preventDefault();
      attachments.openFileDialog();
    },
    [attachments]
  );

  return (
    <DropdownMenuItem {...props} onSelect={handleSelect}>
      <ImageIcon className="mr-2 size-4" /> {label}
    </DropdownMenuItem>
  );
};
