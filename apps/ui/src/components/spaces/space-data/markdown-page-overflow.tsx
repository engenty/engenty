/**
 * Markdown page ⋯ menu (view modes, copy, duplicate, move, export, history, delete).
 *
 * Dialogs come from {@link useArtifactOverflow} so they survive menu close.
 */
import type { ArtifactSummary, MarkdownReadingStyle } from "@engenty/ai-ui";
import { type ReactNode, useMemo } from "react";
import { useParams } from "react-router-dom";
import { useArtifactOverflow } from "./artifact-overflow";
import type { MarkdownPageOverflowLabels } from "./markdown-page-labels";
import { MarkdownPageMenuItems } from "./markdown-page-menu";

export type { MarkdownPageOverflowLabels } from "./markdown-page-labels";

export function useMarkdownPageOverflow(input: {
  artifact: ArtifactSummary;
  content: string;
  labels: MarkdownPageOverflowLabels;
  onClose: () => void;
  readingStyle: MarkdownReadingStyle;
  setReadingStyle: (style: MarkdownReadingStyle) => void;
  spaceId?: string | null;
}): { dialogs: ReactNode; menuItems: ReactNode } {
  const { artifact, content, labels, readingStyle, setReadingStyle, spaceId } =
    input;
  const { spaceKey = "" } = useParams();
  const overflow = useArtifactOverflow({
    artifactId: artifact.id,
    content,
    parentId: artifact.parent_id ?? null,
    spaceId: spaceId ?? null,
    spaceKey,
    title: artifact.title,
    type: artifact.type,
  });

  const menuItems = useMemo(
    () => (
      <MarkdownPageMenuItems
        artifactId={artifact.id}
        content={content}
        duplicatePending={overflow.pending}
        labels={labels}
        onCopyLink={overflow.copyLink}
        onDelete={overflow.openDelete}
        onDuplicate={() => void overflow.duplicate()}
        onMove={overflow.openMove}
        onOpenHistory={overflow.openHistory}
        onReadingStyleChange={setReadingStyle}
        readingStyle={readingStyle}
        spaceId={spaceId ?? null}
        title={artifact.title}
      />
    ),
    [
      artifact.id,
      artifact.title,
      content,
      labels,
      overflow.copyLink,
      overflow.duplicate,
      overflow.openDelete,
      overflow.openHistory,
      overflow.openMove,
      overflow.pending,
      readingStyle,
      setReadingStyle,
      spaceId,
    ]
  );

  return { dialogs: overflow.dialogs, menuItems };
}
