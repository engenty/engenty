import { useTranslation } from "@engenty/i18n/ui";
import { adminListCardsGridClassName, cn } from "@engenty/ui-core";
import { User } from "lucide-react";
import type { TeamMemberListItem } from "../api.js";
import { teamMemberCardBodyLines } from "../lib/team-members-card-fields.js";
import { TeamMemberAvatar } from "./team-member-avatar.js";
import type { TeamMembersColumnVisibility } from "./team-members-display-dialog.js";

type TableSize = "compact" | "normal";

interface TeamMembersCardsProps {
  columnOrder: (keyof TeamMembersColumnVisibility)[];
  columnVisibility: TeamMembersColumnVisibility;
  members: TeamMemberListItem[];
  onCardClick: (member: TeamMemberListItem) => void;
  selectedIds?: ReadonlySet<string>;
  tableSize: TableSize;
}

export function TeamMembersCards({
  columnOrder,
  columnVisibility,
  members,
  tableSize,
  onCardClick,
  selectedIds,
}: TeamMembersCardsProps) {
  const { t } = useTranslation("team");
  const compact = tableSize === "compact";
  const showAvatar = columnVisibility.avatar;
  const showLinkedUser = columnVisibility.linkedUser;
  const bodyLineGap = compact ? "mt-0.5" : "mt-1";
  const headerBodyGap = compact ? "mt-1" : "mt-2";

  return (
    <div className={adminListCardsGridClassName(tableSize)}>
      {members.map((member) => {
        const bodyLines = teamMemberCardBodyLines(
          member,
          columnOrder,
          columnVisibility,
          { noManager: t("noManager") }
        );

        return (
          <button
            className={cn(
              "ui-card-raised group text-left",
              compact ? "p-3" : "p-4",
              selectedIds?.has(member.id) && "ui-card-selected"
            )}
            key={member.id}
            onClick={() => onCardClick(member)}
            type="button"
          >
            <div className="flex items-start gap-3">
              {showAvatar || showLinkedUser ? (
                <div className="flex shrink-0 flex-col items-center gap-1">
                  {showAvatar ? (
                    <TeamMemberAvatar
                      compact={compact}
                      fullName={member.full_name}
                      initials={member.initials}
                      storageKey={member.profile_image_storage_key}
                      variant="card"
                    />
                  ) : null}
                  {showLinkedUser && member.user_id ? (
                    <span
                      aria-label={t("connectedUser")}
                      className="flex h-5 w-5 items-center justify-center rounded-full border border-foreground/10 bg-muted"
                      role="img"
                    >
                      <User className="h-3 w-3 text-muted-foreground" />
                    </span>
                  ) : null}
                </div>
              ) : null}
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium group-hover:underline">
                    {member.full_name}
                  </p>
                </div>
                {bodyLines.map((line, index) => (
                  <p
                    className={cn(
                      "text-muted-foreground text-sm",
                      index === 0 ? headerBodyGap : bodyLineGap
                    )}
                    key={line.key}
                  >
                    {line.value}
                  </p>
                ))}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
