import { DetailPageHeader } from "@engenty/ui-core";
import type { ProjectListItem } from "../api.js";
import type { ProjectTabMeta } from "../hooks/use-project-tabs.js";
import { ProjectSubNav } from "./project-sub-nav.js";
import { ProjectTitleEditable } from "./project-title-editable.js";

interface ProjectDetailHeaderProps {
  editingTitle: boolean;
  onCancelTitle: () => void;
  onConfigureClick: () => void;
  onSaveTitle: () => void;
  onStartEditTitle: () => void;
  onTitleChange: (value: string) => void;
  project: Pick<ProjectListItem, "title" | "client_name" | "client_id">;
  titleValue: string;
  visibleTabs: ProjectTabMeta[];
}

/**
 * Project detail header on the shared `DetailPageHeader`: client name as the
 * eyebrow, the inline-editable title, and the section tabs flush to the bottom
 * edge. Stays a contained, left-aligned `6xl` column so it shares the content's
 * left gutter even on full-width tabs (files).
 */
export function ProjectDetailHeader({
  project,
  visibleTabs,
  onConfigureClick,
  editingTitle,
  titleValue,
  onTitleChange,
  onStartEditTitle,
  onSaveTitle,
  onCancelTitle,
}: ProjectDetailHeaderProps) {
  const clientLabel = project.client_name ?? project.client_id ?? null;

  return (
    <DetailPageHeader
      belowStrip={
        <ProjectSubNav
          onConfigureClick={onConfigureClick}
          visibleTabs={visibleTabs}
        />
      }
      eyebrow={clientLabel}
      // Always the contained reading column, centered — even on full-width
      // content tabs (files) the header stays limited rather than stretching.
      maxWidth="6xl"
      title={
        <ProjectTitleEditable
          editingTitle={editingTitle}
          onCancelTitle={onCancelTitle}
          onSaveTitle={onSaveTitle}
          onStartEditTitle={onStartEditTitle}
          onTitleChange={onTitleChange}
          title={project.title}
          titleValue={titleValue}
        />
      }
    />
  );
}
