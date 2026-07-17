// Team chat: the channel list lives in the shell secondary nav; the selected
// conversation is the `/mdl/team-chat/:conversationId` route param so it
// deep-links; an open thread travels as `?thread=<ts>`.
import { useCoreAuthSession } from "@engenty/auth-ui";
import { useTranslation } from "@engenty/i18n/ui";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { ConversationView } from "../components/conversation-view.js";
import { TeamChatOverview } from "../components/team-chat-overview.js";
import { useTeamChatSecondaryNav } from "../hooks/use-team-chat-secondary-nav.js";
import { conversationDisplayName, usersById } from "../lib/format.js";
import { useConversationQuery, useTenantUsersQuery } from "../queries.js";

export function TeamChatClientPage() {
  const { t } = useTranslation("team-chat");
  const { conversationId } = useParams<{ conversationId?: string }>();
  const { session } = useCoreAuthSession();
  const currentUserId = session?.user?.id ?? null;
  const { moduleRootCrumb, secondaryNavAfterItems, secondaryNavHeaderSlot } =
    useTeamChatSecondaryNav();
  const conversationQuery = useConversationQuery(conversationId ?? null);
  const usersQuery = useTenantUsersQuery();

  const conversationLabel = useMemo(() => {
    if (!(conversationId && conversationQuery.data)) {
      return null;
    }
    const label = conversationDisplayName(
      conversationQuery.data,
      usersById(usersQuery.data),
      currentUserId
    );
    return conversationQuery.data.name ? `#${label}` : label;
  }, [conversationId, conversationQuery.data, usersQuery.data, currentUserId]);

  const breadcrumbs = useMemo(
    () => [
      ...(moduleRootCrumb ? [moduleRootCrumb] : []),
      ...(conversationLabel
        ? [{ label: conversationLabel }]
        : [{ label: t("nav.overview") }]),
    ],
    [moduleRootCrumb, conversationLabel, t]
  );

  usePageConfig({
    breadcrumbs,
    secondaryNavAfterItems,
    secondaryNavHeaderSlot,
    topbarChrome: "contentBlend",
  });

  return (
    <div className="flex h-full min-h-0 w-full flex-1 overflow-hidden">
      {conversationId ? (
        <ConversationView conversationId={conversationId} />
      ) : (
        <TeamChatOverview />
      )}
    </div>
  );
}
