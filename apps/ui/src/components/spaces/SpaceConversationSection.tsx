/**
 * One section of the conversation list: a personal one, or a built-in
 * (Engenties · Räume · Direkt). The heading collapses it, links
 * the Engenties roster page for the agents built-in, and carries the section's
 * "+" or ⋮. The body is a drop zone of rows. Empty Räume and Direkt stay
 * off the list until they have a chat.
 */
import { conversationEngagement } from "@engenty/ai-core/browser";
import {
  AgentFace,
  type ChatSpaceAudience,
  chatVisibilityOf,
  useAgentLiveActivityMap,
} from "@engenty/ai-ui";
import { useTranslation } from "@engenty/i18n/ui";
import {
  Collapsible,
  CollapsibleContent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@engenty/ui-core";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import {
  isSpaceAgentNavActive,
  isSpaceAgentsListActive,
  resolveSpaceAgentDestination,
} from "@/lib/space-agent-nav";
import type {
  SpaceConversationItem,
  SpaceConversationSectionModel,
} from "@/lib/space-conversation-sections";
import { spaceAgentsPath, spaceRoomPath } from "@/lib/space-routes";
import type { SpaceRosterAgent } from "@/lib/use-space-roster-agents";
import { useSpaceSectionOpen } from "@/lib/use-space-section-open";
import { SpaceAgentHireTrigger } from "./SpaceAgentHireTrigger";
import { SpaceAgentNavRow } from "./SpaceAgentNavRow";
import { SpaceDmNavRow } from "./SpaceDmNavRow";
import { SpaceRoomNavRow } from "./SpaceRoomNavRow";
import {
  SpaceConversationDraggable,
  SpaceConversationDropZone,
} from "./space-conversation-dnd";
import { SpaceConversationNavMenu } from "./space-conversation-nav-menu";
import { useSpaceConversationSidebarActions } from "./space-conversation-sidebar-context";
import {
  SpaceSectionAddButton,
  SpaceSectionHeading,
} from "./space-section-heading";

const BUILT_IN_SECTION_LABELS = {
  agents: "Engenties",
  dms: "Direct",
  rooms: "Rooms",
} as const;

/** One row of any kind, with its menu, for a section or for Favoriten. */
export function SpaceConversationRow({
  audience,
  isPinned,
  item,
  rosterById,
  sectionId,
  spaceKey,
}: {
  /** How far the space reaches — the tier of its desks and open rooms. */
  audience: ChatSpaceAudience | null;
  isPinned: boolean;
  item: SpaceConversationItem;
  rosterById: ReadonlyMap<string, SpaceRosterAgent>;
  sectionId: string;
  spaceKey: string;
}) {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const openEngagement = searchParams.get("engagement");
  // One run feed for the whole list — every row asks the same query, so the
  // sidebar polls once however many desks it carries.
  const liveByAgent = useAgentLiveActivityMap();
  const menu = (
    <SpaceConversationNavMenu
      isPinned={isPinned}
      item={item}
      sectionId={sectionId}
    />
  );
  switch (item.kind) {
    case "desk":
      return (
        <SpaceAgentNavRow
          active={
            isSpaceAgentNavActive(location.pathname, item.agent.id, spaceKey) &&
            !openEngagement
          }
          activity={item.activity}
          agent={item.agent}
          destination={resolveSpaceAgentDestination(item.agent.id, spaceKey)}
          live={liveByAgent.get(item.agent.id) ?? null}
          menu={menu}
          visibility={chatVisibilityOf("desk", null, audience)}
        />
      );
    case "room":
      return (
        <SpaceRoomNavRow
          active={
            location.pathname === spaceRoomPath(spaceKey, item.room.session.id)
          }
          menu={menu}
          room={item.room}
          rosterById={rosterById}
          spaceAudience={audience}
          spaceKey={spaceKey}
        />
      );
    case "dm":
      return (
        <SpaceDmNavRow
          active={
            isSpaceAgentNavActive(
              location.pathname,
              item.dm.agent_id,
              spaceKey
            ) && openEngagement === conversationEngagement(item.dm.session.id)
          }
          agent={item.agent}
          dm={item.dm}
          menu={menu}
          spaceKey={spaceKey}
        />
      );
    default:
      return null;
  }
}

export function SpaceConversationSection({
  audience,
  canAdd,
  pinnedKeys,
  rosterAgents,
  rosterById,
  section,
  spaceId,
  spaceKey,
}: {
  audience: ChatSpaceAudience | null;
  canAdd: boolean;
  pinnedKeys: ReadonlySet<string>;
  rosterAgents: readonly SpaceRosterAgent[];
  rosterById: ReadonlyMap<string, SpaceRosterAgent>;
  section: SpaceConversationSectionModel;
  spaceId: string;
  spaceKey: string;
}) {
  const { t } = useTranslation("common");
  const location = useLocation();
  const actions = useSpaceConversationSidebarActions();
  const [open, setOpen] = useSpaceSectionOpen(
    `engenty.space.conversations.${section.id}.open`,
    spaceKey
  );
  const label =
    section.kind === "personal"
      ? (section.name ?? "")
      : t(`spaces.conversations.${section.kind}`, {
          defaultValue: BUILT_IN_SECTION_LABELS[section.kind],
        });

  let action: ReactNode = null;
  if (section.kind === "personal") {
    action = (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SpaceSectionAddButton
            aria-label={t("spaces.conversations.sectionMenu", {
              defaultValue: "Section actions",
            })}
            asChild
          >
            <button type="button">
              <MoreHorizontal className="size-3.5" />
            </button>
          </SpaceSectionAddButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[10rem]">
          <DropdownMenuItem
            onSelect={() =>
              actions.openNameDialog({
                initial: section.name ?? "",
                label: t("spaces.conversations.sectionNameLabel", {
                  defaultValue: "Name",
                }),
                onSubmit: (name) => actions.renameSection(section.id, name),
                submitLabel: t("actions.save", { defaultValue: "Save" }),
                title: t("spaces.conversations.renameSection", {
                  defaultValue: "Rename section",
                }),
              })
            }
          >
            <Pencil className="mr-2 size-4" />
            {t("spaces.conversations.rename", { defaultValue: "Rename" })}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => actions.deleteSection(section.id)}
            variant="destructive"
          >
            <Trash2 className="mr-2 size-4" />
            {t("spaces.conversations.deleteSection", {
              defaultValue: "Delete section",
            })}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  } else if (section.kind === "agents" && canAdd) {
    action = (
      <SpaceAgentHireTrigger
        spaceId={spaceId}
        spaceKey={spaceKey}
        variant="section"
      />
    );
  } else if (section.kind === "rooms" && canAdd) {
    action = (
      <SpaceSectionAddButton
        aria-label={t("spaces.agents.newRoom", {
          defaultValue: "New group chat",
        })}
        onClick={() => actions.openNewRoom()}
      />
    );
  } else if (section.kind === "dms" && rosterAgents.length > 0) {
    action = (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SpaceSectionAddButton
            aria-label={t("spaces.conversations.newDm", {
              defaultValue: "New direct message",
            })}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[10rem]">
          {rosterAgents.map((agent) => (
            <DropdownMenuItem
              key={agent.id}
              onSelect={() => actions.openDm(agent.id)}
            >
              <AgentFace
                avatarUrl={agent.avatarUrl}
                className="mr-2 [&_.e-shadow]:hidden"
                kind={agent.engenty}
                name={agent.name}
                size={18}
              />
              {agent.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  const headingProps =
    section.kind === "agents"
      ? {
          active: isSpaceAgentsListActive(location.pathname, spaceKey),
          to: spaceAgentsPath(spaceKey),
        }
      : {};

  if (
    (section.kind === "rooms" || section.kind === "dms") &&
    section.items.length === 0
  ) {
    return null;
  }

  return (
    <Collapsible
      className="group/section flex flex-col"
      data-testid={`space-conversation-section-${section.id}`}
      onOpenChange={setOpen}
      open={open}
    >
      <SpaceSectionHeading
        action={action}
        count={section.items.length}
        onOpenChange={setOpen}
        open={open}
        {...headingProps}
      >
        {label}
      </SpaceSectionHeading>
      <CollapsibleContent>
        <SpaceConversationDropZone
          className="flex min-h-2 flex-col"
          id={section.id}
          items={section.items.map((item) => item.key)}
        >
          {section.items.map((item) => (
            <SpaceConversationDraggable id={item.key} key={item.key}>
              <SpaceConversationRow
                audience={audience}
                isPinned={pinnedKeys.has(item.key)}
                item={item}
                rosterById={rosterById}
                sectionId={section.id}
                spaceKey={spaceKey}
              />
            </SpaceConversationDraggable>
          ))}
          {section.kind === "agents" && section.items.length === 0 ? (
            <p className="px-2 text-muted-foreground text-sm">
              {t("spaces.agents.empty", {
                defaultValue: "No agents here yet.",
              })}
            </p>
          ) : null}
        </SpaceConversationDropZone>
      </CollapsibleContent>
    </Collapsible>
  );
}
