/**
 * `/s/<key>/chats` — every conversation held in this space, in one place.
 *
 * The space's own page, not a module's: Copilot's private chats and each
 * specialist's are all threads in THIS space, and no one module owns
 * that list (PLAN-space-chats.md). It is a destination, not navigation — the
 * sidebar keeps showing the space's residents, and this is where you come when
 * you remember a conversation but not who you had it with.
 *
 * Grouped by kind before anything else — a room has a way in, a desk is the
 * team's, a DM is yours — because that is the one thing about this list a
 * reader can get wrong in a way that matters. Rooms you are not in yet are
 * listed here with a way in; the sidebar shows only the ones you joined.
 */
import {
  SpaceChatsList,
  type SpaceChatsListLabels,
  useJoinRoomMutation,
  useSpaceChats,
} from "@engenty/ai-ui";
import { useTranslation } from "@engenty/i18n/ui";
import {
  DetailPageHeader,
  Input,
  Label,
  Switch,
  uiPageScrollClassName,
} from "@engenty/ui-core";
import { type PageBreadcrumb, usePageConfig } from "@engenty/ui-plugin-sdk";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { resolveSpaceChatDestination } from "@/lib/space-agent-nav";
import { useSpaceAudience } from "@/lib/space-audience";
import { spaceRoomPath, spaceRootPath } from "@/lib/space-routes";
import { useSpacesQuery } from "@/lib/spaces-queries";

export function SpaceChatsPage() {
  const { t } = useTranslation("common");
  const { spaceKey = "" } = useParams<{ spaceKey: string }>();
  const spacesQuery = useSpacesQuery();
  const space = useMemo(
    () => spacesQuery.data?.find((candidate) => candidate.key === spaceKey),
    [spaceKey, spacesQuery.data]
  );
  const spaceAudience = useSpaceAudience(space);
  const [query, setQuery] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const { error, groups, isLoading } = useSpaceChats({
    includeArchived,
    query,
    spaceId: space?.id ?? null,
  });
  const joinRoom = useJoinRoomMutation();

  const breadcrumbs = useMemo<PageBreadcrumb[]>(
    () => [{ label: t("spaces.chats.section", { defaultValue: "Chats" }) }],
    [t]
  );

  const labels = useMemo<SpaceChatsListLabels>(
    () => ({
      emptyDescription: t("spaces.chats.emptyDescription", {
        defaultValue:
          "Talk to one of this space's agents and the conversation shows up here.",
      }),
      emptyTitle: t("spaces.chats.emptyTitle", {
        defaultValue: "No conversations yet",
      }),
      join: t("spaces.chats.join", { defaultValue: "Join" }),
      joining: t("spaces.chats.joining", { defaultValue: "Joining…" }),
      kindHint: {
        desk: t("spaces.chats.deskHint", {
          defaultValue:
            "Each agent's one conversation with the team. Everyone in this space reads and posts.",
        }),
        dm: t("spaces.chats.dmHint", {
          defaultValue:
            "Your private lines with an agent. Only you read these.",
        }),
        room: t("spaces.chats.roomHint", {
          defaultValue:
            "Named chats with members. Join the open ones; private ones are by invitation.",
        }),
      },
      kindTitle: {
        desk: t("spaces.chats.deskTitle", { defaultValue: "Agents" }),
        dm: t("spaces.chats.dmTitle", { defaultValue: "Direct messages" }),
        room: t("spaces.chats.roomTitle", { defaultValue: "Rooms" }),
      },
      loadFailed: t("spaces.chats.loadFailed", {
        defaultValue: "The conversations could not be loaded.",
      }),
      untitled: t("spaces.chats.untitled", { defaultValue: "New chat" }),
    }),
    [t]
  );

  usePageConfig({
    actions: null,
    breadcrumbs,
    contentStackBackground: "paper",
    topbarOverlap: true,
  });

  if (!(spacesQuery.isPending || space)) {
    return <Navigate replace to={spaceRootPath(spaceKey)} />;
  }

  return (
    <div className={uiPageScrollClassName}>
      <DetailPageHeader
        description={
          <p>
            {t("spaces.chats.intro", {
              defaultValue:
                "Every conversation held in this space: rooms, the agents' desks, your direct messages.",
            })}
          </p>
        }
        maxWidth="5xl"
        title={t("spaces.chats.section", { defaultValue: "Chats" })}
        variant="canvas"
      />
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-page pb-10">
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative min-w-64 flex-1">
            <Search
              aria-hidden
              className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              className="pl-8"
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("spaces.chats.searchPlaceholder", {
                defaultValue: "Search conversations and agents",
              })}
              value={query}
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={includeArchived}
              id="space-chats-archived"
              onCheckedChange={setIncludeArchived}
            />
            <Label
              className="text-muted-foreground text-sm"
              htmlFor="space-chats-archived"
            >
              {t("spaces.chats.showArchived", {
                defaultValue: "Show archived",
              })}
            </Label>
          </div>
        </div>
        <SpaceChatsList
          error={error}
          groups={groups}
          isLoading={isLoading}
          labels={labels}
          onJoin={(row) => joinRoom.mutate(row.id)}
          resolveHref={(row) =>
            row.kind === "room"
              ? spaceRoomPath(spaceKey, row.id)
              : resolveSpaceChatDestination(row.agentId, spaceKey, row.id)
          }
          spaceAudience={spaceAudience}
        />
      </div>
    </div>
  );
}
