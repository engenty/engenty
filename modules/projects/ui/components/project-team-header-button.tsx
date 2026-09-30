import { useTranslation } from "@engenty/i18n/ui";
import {
  AvatarStack,
  type AvatarStackProfile,
  Button,
  cn,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@engenty/ui-core";
import { Users } from "lucide-react";
import { useMemo, useState } from "react";
import type { ProjectTeamMemberRow } from "../api.js";
import type { TeamMemberCatalogRow } from "../plugins.js";
import {
  catalogRowByMembershipKey,
  ProjectTeamMembersSection,
} from "./project-team-members-section.js";

/**
 * The project team in the header: the members' avatars, and a click opens the
 * team editor in place (add, roles, remove). With nobody on the team, an
 * empty-team icon waits for the caller's hover group (`revealClassName`).
 */
export function ProjectTeamHeaderButton({
  catalog,
  editable,
  onProjectUpdated,
  projectId,
  projectTeamMembers,
  revealClassName,
}: {
  catalog: TeamMemberCatalogRow[];
  editable: boolean;
  onProjectUpdated: () => void | Promise<void>;
  projectId: string;
  projectTeamMembers: ProjectTeamMemberRow[];
  revealClassName: string;
}) {
  const { t } = useTranslation("projects");
  const [open, setOpen] = useState(false);
  const profiles = useMemo((): AvatarStackProfile[] => {
    const rowByKey = catalogRowByMembershipKey(catalog);
    return projectTeamMembers.map((m) => {
      const row = rowByKey.get(m.user_id);
      return {
        avatar_url: null,
        full_name: row?.full_name ?? m.user_id,
        id: m.user_id,
        is_connected: Boolean(row?.user_id),
      };
    });
  }, [catalog, projectTeamMembers]);

  const stack =
    profiles.length > 0 ? (
      <AvatarStack max={5} profiles={profiles} size="lg" />
    ) : null;
  if (!editable) {
    return stack;
  }

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        {stack ? (
          <button
            aria-label={t("detail.members.listHeading")}
            className="cursor-pointer rounded-full transition-opacity hover:opacity-90"
            type="button"
          >
            {stack}
          </button>
        ) : (
          <Button
            aria-label={t("detail.members.listHeading")}
            className={cn(
              "size-10 p-0 text-inherit opacity-0 transition-opacity hover:bg-current/10 hover:text-inherit focus-visible:opacity-100",
              open ? "opacity-100" : revealClassName
            )}
            size="icon"
            title={t("detail.members.listHeading")}
            type="button"
            variant="ghost"
          >
            <Users className="size-5" />
          </Button>
        )}
      </PopoverTrigger>
      {/* Solid, not the floating glass; the sidebar's section inside. */}
      <PopoverContent
        align="end"
        className="w-96 bg-background p-4 backdrop-blur-none"
      >
        <ProjectTeamMembersSection
          catalog={catalog}
          defaultExpanded
          onProjectUpdated={onProjectUpdated}
          projectId={projectId}
          projectTeamMembers={projectTeamMembers}
          variant="sidebar"
        />
      </PopoverContent>
    </Popover>
  );
}
