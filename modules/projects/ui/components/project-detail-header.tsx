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
import type { ProjectListItem, ProjectTeamMemberRow } from "../api.js";
import type { ProjectTabMeta } from "../hooks/use-project-tabs.js";
import type { TeamMemberCatalogRow } from "../plugins.js";
import type { ProjectClientSelection } from "./project-client-topline.js";
import { ProjectClientTopline } from "./project-client-topline.js";
import { ProjectStarButton } from "./project-pin-button.js";
import { ProjectSubNav } from "./project-sub-nav.js";
import { ProjectSubtitleEditable } from "./project-subtitle-editable.js";
import { ProjectTeamHeaderButton } from "./project-team-header-button.js";
import { ProjectTitleEditable } from "./project-title-editable.js";

interface ProjectDetailHeaderProps {
  editingTitle: boolean;
  onCancelTitle: () => void;
  /** Absent: the client line is read-only. */
  onClientChange?: (next: ProjectClientSelection) => void;
  onConfigureClick: () => void;
  /** Absent: the cover is read-only (no add / change / remove). */
  onCoverChange?: (cover: Cover | null) => void;
  onSaveTitle: () => void;
  onStartEditTitle: () => void;
  /** Absent: the subtitle is read-only. `null` clears it. */
  onSubtitleChange?: (next: string | null) => void;
  onTitleChange: (value: string) => void;
  /** Tasks not done yet — the count on the cover. */
  openTaskCount: number;
  project: Pick<
    ProjectListItem,
    "client_id" | "client_name" | "cover" | "id" | "subtitle" | "title"
  > & { project_team?: ProjectTeamMemberRow[] };
  /** The team module's catalog; `null` without the team module (no avatars). */
  team: {
    catalog: TeamMemberCatalogRow[];
    editable: boolean;
    onProjectUpdated: () => void | Promise<void>;
  } | null;
  titleValue: string;
  visibleTabs: ProjectTabMeta[];
  /** Full-width tools (files, Gantt) get the wide header. */
  wide?: boolean;
}

/**
 * Project detail header: the client line as the eyebrow, the inline-editable
 * title with its star and subtitle, the team's avatars on the right, and the
 * section tabs underneath. `5xl` on the reading tabs — wider
 * than their `3xl` content column, so the header frames the page — and `6xl`
 * (not stretched) on full-width tools.
 *
 * With a cover the title block and the tabs sit on it as one card (client,
 * title, open tasks, sections); without one it is the plain canvas header with "Add cover" beside
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
  onSubtitleChange,
  onCancelTitle,
  onClientChange,
  team,
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
  // Client above the title (with the contacts module): pen to change it, link
  // to the contact — as on an offer.
  const clientLine = (
    <ProjectClientTopline
      clientId={project.client_id}
      clientName={project.client_name}
      onChange={onClientChange}
      revealClassName="group-hover/header:opacity-60"
    />
  );
  // The team's faces (with the team module); a click edits the team in place.
  const teamButton = team ? (
    <ProjectTeamHeaderButton
      catalog={team.catalog}
      editable={team.editable}
      onProjectUpdated={team.onProjectUpdated}
      projectId={project.id}
      projectTeamMembers={project.project_team ?? []}
      revealClassName="group-hover/header:opacity-100"
    />
  ) : null;
  const tabs = (
    <ProjectSubNav
      onConfigureClick={onConfigureClick}
      visibleTabs={visibleTabs}
    />
  );
  const coverTabs = (
    <ProjectSubNav
      onConfigureClick={onConfigureClick}
      onCover
      visibleTabs={visibleTabs}
    />
  );
  // Starred: a filled star beside the title. Not starred: an empty one while
  // the header is hovered, so it can be starred from here.
  const star = (
    <ProjectStarButton
      projectId={project.id}
      revealClassName="group-hover/header:opacity-100"
    />
  );
  // Under the title: set, it reads as text; unset, "Add subtitle…" shows on
  // header hover and while the title is being edited.
  const subtitleLine = (
    <ProjectSubtitleEditable
      onSave={onSubtitleChange}
      reveal={editingTitle}
      revealClassName="group-hover/header:opacity-60"
      subtitle={project.subtitle}
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
      titleAdornment={star}
      titleValue={titleValue}
    />
  );

  if (project.cover) {
    return (
      <header className="group/header w-full shrink-0">
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
              <>
                <div className="flex items-end justify-between gap-4 px-7 pt-5 pb-2">
                  <div className="min-w-0">
                    <div className="min-w-0 text-sm opacity-80">
                      {clientLine}
                    </div>
                    <h1 className="min-w-0 font-heading font-semibold text-[28px] leading-9 tracking-tight">
                      {title}
                    </h1>
                    <div className="mt-0.5 min-w-0 text-[15px] opacity-90">
                      {subtitleLine}
                    </div>
                  </div>
                  <span className="shrink-0 font-medium text-sm opacity-90">
                    {t("cover.openTasks", { count: openTaskCount })}
                  </span>
                </div>
                {/* The tabs close the cover: title, then the sections of the
                    same project, one card. 1px below
                    so the band's clipping leaves the active underline whole. */}
                <div className="flex items-end px-4 pb-px">{coverTabs}</div>
              </>
            }
            media={coverMedia}
            minHeight={220}
            onChange={onCoverChange}
            topRight={teamButton}
          />
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
        description={subtitleLine}
        eyebrow={clientLine}
        maxWidth={wide ? "6xl" : "5xl"}
        status={
          <div className="flex items-center gap-2">
            {onCoverChange ? (
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
            ) : null}
            {teamButton}
          </div>
        }
        title={title}
        // No band: title and tabs sit on the page canvas, like the content.
        variant="canvas"
      />
    </>
  );
}
