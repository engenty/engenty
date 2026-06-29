import { Button } from "@engenty/ui-core";
import { SquarePen } from "lucide-react";
import { MessageResponse } from "../../components/presentation.js";
import { COMPACT_MARKDOWN_PROSE_CLASSNAME } from "../../lib/admin/compact-markdown-prose-classname";

function clipInstructionPreview(body: string, maxChars: number) {
  const trimmed = body.trim();
  if (trimmed.length <= maxChars) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxChars)}…`;
}

interface AgentInstructionSettingsPreviewProps {
  body: string;
  documentKey: string;
  editAriaLabel: string;
  emptyBodyLabel: string;
  /** Smallest line above `heading` (e.g. soul meta). */
  eyebrow?: string;
  heading: string;
  /** When set, body is clipped to this length; omit for full text. */
  maxChars?: number;
  onEdit: (documentKey: string) => void;
  /** Hide the edit button entirely (external/read-only agents). */
  readOnly?: boolean;
}

export function AgentInstructionSettingsPreview({
  body,
  documentKey,
  editAriaLabel,
  emptyBodyLabel,
  eyebrow,
  heading,
  maxChars,
  onEdit,
  readOnly = false,
}: AgentInstructionSettingsPreviewProps) {
  const preview =
    maxChars === undefined
      ? body.trim()
      : clipInstructionPreview(body, maxChars);
  const hasBody = preview.length > 0;

  return (
    <div className="group relative py-4 pr-12">
      {readOnly ? null : (
        <Button
          aria-label={editAriaLabel}
          className="absolute top-3 right-0 size-8 text-muted-foreground opacity-0 transition-opacity duration-150 hover:text-foreground group-focus-within:opacity-100 group-hover:opacity-100"
          onClick={() => onEdit(documentKey)}
          size="icon"
          type="button"
          variant="ghost"
        >
          <SquarePen aria-hidden className="size-4" />
        </Button>
      )}
      {eyebrow ? (
        <p className="mb-1 font-medium text-muted-foreground text-xxs uppercase tracking-widest">
          {eyebrow}
        </p>
      ) : null}
      <h3 className="font-semibold text-sm">{heading}</h3>
      {hasBody ? (
        <div className="mt-2 min-w-0 break-words">
          <MessageResponse className={COMPACT_MARKDOWN_PROSE_CLASSNAME}>
            {preview}
          </MessageResponse>
        </div>
      ) : (
        <p className="mt-2 text-muted-foreground text-sm">{emptyBodyLabel}</p>
      )}
    </div>
  );
}
