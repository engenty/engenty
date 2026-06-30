import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import {
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@engenty/ui-core";
import { ArrowUpRight, Users } from "lucide-react";
import { useCallback, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { TeamMemberListItem } from "../../api.js";
import { teamMembersListOptions } from "../../queries.js";
import { TEAM_MODULE_BASE, teamMemberDetailPath } from "../../team-paths.js";
import { TeamMemberAvatar } from "../team-member-avatar.js";
import { TeamMemberProfileHeader } from "../team-member-profile-header.js";

const WIDGET_PAGE_SIZE = 8;

export function TeamQuickSearchWidget() {
  const { t } = useTranslation("team");
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<TeamMemberListItem | null>(null);

  const query = useQuery(
    teamMembersListOptions({
      page: 1,
      pageSize: WIDGET_PAGE_SIZE,
      search: search.trim() || undefined,
      sortBy: "full_name",
      sortOrder: "asc",
    })
  );

  const members = query.data?.data ?? [];

  const handleSelect = useCallback((member: TeamMemberListItem) => {
    setSelected(member);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && members.length > 0) {
        setSelected(members[0]);
      }
    },
    [members]
  );

  return (
    <>
      <div className="flex h-full flex-col gap-2">
        <Command className="rounded-lg border" shouldFilter={false}>
          <CommandInput
            onKeyDown={handleKeyDown}
            onValueChange={setSearch}
            placeholder={t("widget.searchPlaceholder", {
              defaultValue: "Search team members…",
            })}
            value={search}
          />
          <CommandList>
            {query.isFetching ? null : (
              <CommandEmpty>
                {t("widget.noResults", { defaultValue: "No results" })}
              </CommandEmpty>
            )}
            {members.length > 0 && (
              <CommandGroup>
                {members.map((member) => (
                  <CommandItem
                    className="flex items-center gap-2.5 py-1.5"
                    key={member.id}
                    onSelect={() => handleSelect(member)}
                    value={member.id}
                  >
                    <TeamMemberAvatar
                      compact
                      fullName={member.full_name}
                      initials={member.initials}
                      storageKey={member.profile_image_storage_key}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-sm">
                        {member.full_name}
                      </span>
                      {(member.position || member.department) && (
                        <span className="block truncate text-muted-foreground text-xs">
                          {member.position ?? member.department}
                        </span>
                      )}
                    </span>
                    <button
                      aria-label={t("widget.openFullProfile", {
                        defaultValue: "Open full profile",
                      })}
                      className="ml-auto shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(teamMemberDetailPath(member.id));
                      }}
                      type="button"
                    >
                      <ArrowUpRight className="size-3.5" />
                    </button>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>

        <div className="mt-auto">
          <Button
            asChild
            className="w-full justify-start gap-2"
            size="sm"
            variant="ghost"
          >
            <Link to={TEAM_MODULE_BASE}>
              <Users className="size-3.5" />
              {t("widget.viewAll", { defaultValue: "View all team members" })}
            </Link>
          </Button>
        </div>
      </div>

      {selected && (
        <Dialog onOpenChange={(open) => !open && setSelected(null)} open>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="sr-only">
                {selected.full_name}
              </DialogTitle>
            </DialogHeader>
            <TeamMemberProfileHeader member={selected} />
            <div className="flex justify-end pt-2">
              <Button asChild size="sm">
                <Link to={teamMemberDetailPath(selected.id)}>
                  {t("widget.openFullProfile", {
                    defaultValue: "Open full profile",
                  })}
                  <ArrowUpRight className="ml-1.5 size-3.5" />
                </Link>
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
