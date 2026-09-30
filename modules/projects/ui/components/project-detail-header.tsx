import type { Cover } from "@engenty/covers";
import {
  CoverBand,
  CoverDialog,
  createCoverMediaHttpAdapter,
} from "@engenty/covers/ui";
import { useTranslation } from "@engenty/i18n/ui";
import { Button, cn, DetailPageHeader } from "@engenty/ui-core";
import { ImageIcon } from "lucide-react";
import { useMemo, useState } from "react";
import type { ProjectListItem } from "../api.js";
import type { ProjectTabMeta } from "../hooks/use-project-tabs.js";
import { ProjectSubNav } from "./project-sub-nav.js";
import { ProjectTitleEditable } from "./project-title-editable.js";

interface ProjectDetailHeaderProps {
  editingTitle: boolean;
  onCancelTitle: () => void;
  onConfigureClick: () => void;
  /** Absent: the cover is read-only (no add / change / remove). */
  onCoverChange?: (cover: Cover | null) => void;
  onSaveTitle: () => void;
  onStartEditTitle: () => void;
  onTitleChange: (value: string) => void;
  /** Tasks not done yet — the count on the cover. */
  openTaskCount: number;
  project: Pick<
    ProjectListItem,
    "client_id" | "client_name" | "cover" | "id" | "title"
  >;
  titleValue: string;
  visibleTabs: ProjectTabMeta[];
  /** Full-width tools (files, Gantt) get the wide header. */
  wide?: boolean;
}

/**
 * Project detail header: client name as the eyebrow, the inline-editable
 * title, and the section tabs underneath. `5xl` on the reading tabs — wider
 * than their `3xl` content column, so the header frames the page — and `6xl`
 * (not stretched) on full-width tools.
 *
 * With a cover the title block sits on it as one card (client, title, open
 * tasks); without one it is the plain canvas header with "Add cover" beside
 * the title on hover.
 */
export function ProjectDetailHeader({
  project,
  visibleTabs,
  onConfigureClick,
  onCoverChange,
  editingTitle,
  openTaskCount,
  titleValue,
  onTitleChange,
  onStartEditTitle,
  onSaveTitle,
  onCancelTitle,
  wide = false,
}: ProjectDetailHeaderProps) {
  const { t } = useTranslation("projects");
  const [coverDialogOpen, setCoverDialogOpen] = useState(false);
  const coverMedia = useMemo(
    () =>
      createCoverMediaHttpAdapter({
        basePath: "/api/projects/cover",
        ownerField: "project_id",
        ownerId: project.id,
      }),
    [project.id]
  );
  const clientLabel = project.client_name ?? project.client_id ?? null;
  const tabs = (
    <ProjectSubNav
      onConfigureClick={onConfigureClick}
      visibleTabs={visibleTabs}
    />
  );
  const title = (
    <ProjectTitleEditable
      editingTitle={editingTitle}
      onCancelTitle={onCancelTitle}
      onSaveTitle={onSaveTitle}
      onStartEditTitle={onStartEditTitle}
      onTitleChange={onTitleChange}
      title={project.title}
      titleValue={titleValue}
    />
  );

  if (project.cover) {
    return (
      <header className="w-full shrink-0">
        <div
          className={cn(
            // Same column and top clearance as `DetailPageHeader` canvas.
            "mx-auto flex w-full flex-col px-2 pt-14 pb-2 sm:px-4 md:px-5 md:pb-3",
            wide ? "max-w-6xl" : "max-w-5xl"
          )}
        >
          <CoverBand
            className="rounded-2xl shadow-sm"
            cover={project.cover}
            editable={Boolean(onCoverChange)}
            header={
              <div className="flex items-end justify-between gap-4 p-5">
                <div className="min-w-0">
                  {clientLabel ? (
                    <div className="truncate text-sm opacity-80">
                      {clientLabel}
                    </div>
                  ) : null}
                  <h1 className="min-w-0 font-heading font-semibold text-[28px] leading-9 tracking-tight">
                    {title}
                  </h1>
                </div>
                <span className="shrink-0 font-medium text-sm opacity-90">
                  {t("cover.openTasks", { count: openTaskCount })}
                </span>
              </div>
            }
            media={coverMedia}
            minHeight={220}
            onChange={onCoverChange}
          />
          <div className="mt-6 flex items-end">{tabs}</div>
        </div>
      </header>
    );
  }

  return (
    <>
      {onCoverChange ? (
        <CoverDialog
          currentCover={null}
          media={coverMedia}
          onApplyCover={onCoverChange}
          onOpenChange={setCoverDialogOpen}
          open={coverDialogOpen}
          pending={false}
        />
      ) : null}
      <DetailPageHeader
        belowStrip={tabs}
        className="group/header"
        eyebrow={clientLabel}
        maxWidth={wide ? "6xl" : "5xl"}
        status={
          onCoverChange ? (
            <Button
              className="h-7 gap-1.5 px-2.5 text-muted-foreground/70 text-xs opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover/header:opacity-100"
              onClick={() => setCoverDialogOpen(true)}
              size="sm"
              type="button"
              variant="ghost"
            >
              <ImageIcon aria-hidden className="size-3.5" />
              {t("covers.add_cover_hint", { ns: "common" })}
            </Button>
          ) : null
        }
        title={title}
        // No band: title and tabs sit on the page canvas, like the content.
        variant="canvas"
      />
    </>
  );
}
