"use client";

import { Button, Textarea } from "@engenty/ui-core";
import { useCallback } from "react";

export interface StarterPromptItem {
  id: string;
  label: string;
  prompt: string;
}

export interface CopilotComposerProps {
  clearLabel?: string;
  disabled?: boolean;
  draft: string;
  onDraftChange: (value: string) => void;
  onSubmit: (text: string) => void;
  placeholder?: string;
  sendLabel?: string;
  starterPrompts?: StarterPromptItem[];
  status: "ready" | "streaming" | "submitted" | "error";
}

export function CopilotComposer({
  draft,
  onDraftChange,
  onSubmit,
  status,
  starterPrompts = [],
  placeholder = "Type a message…",
  sendLabel = "Send",
  clearLabel,
  disabled = false,
}: CopilotComposerProps) {
  const canSend = status === "ready" && draft.trim().length > 0 && !disabled;

  const handleSubmit = useCallback(() => {
    const text = draft.trim();
    if (!text || status !== "ready") {
      return;
    }
    onSubmit(text);
    onDraftChange("");
  }, [draft, onDraftChange, onSubmit, status]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  return (
    <div className="flex flex-col gap-2">
      {starterPrompts.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {starterPrompts.map((item) => (
            <Button
              className="h-auto py-1.5 text-left font-normal"
              key={item.id}
              onClick={() => onDraftChange(item.prompt)}
              size="sm"
              type="button"
              variant="outline"
            >
              {item.label}
            </Button>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Textarea
          className="min-h-[80px] flex-1 resize-y"
          disabled={disabled || status !== "ready"}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          value={draft}
        />
        <div className="flex flex-col gap-1">
          <Button
            disabled={!canSend}
            onClick={handleSubmit}
            size="sm"
            type="button"
          >
            {sendLabel}
          </Button>
          {clearLabel && draft.trim().length > 0 && (
            <Button
              onClick={() => onDraftChange("")}
              size="sm"
              type="button"
              variant="ghost"
            >
              {clearLabel}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
