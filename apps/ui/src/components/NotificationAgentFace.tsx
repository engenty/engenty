/**
 * Who a notification card is from: the agent's own portrait and display
 * name from its space's roster — the same face and name its desk card and
 * sidebar row show (a module agent's row carries only its key). A record
 * from no agent, or one the roster does not know, keeps the kind's glyph and
 * the server's label.
 */
import { AgentFace } from "@engenty/ai-ui";
import {
  type NotificationDto,
  type NotificationFaceRenderer,
  registerNotificationActorName,
} from "@engenty/notifications-ui";
import {
  type SpaceRosterAgent,
  useSpaceRosterAgents,
} from "@/lib/use-space-roster-agents";

function useRosterAgent(
  notification: NotificationDto
): SpaceRosterAgent | undefined {
  const agentId =
    notification.actor_kind === "agent" ? notification.actor_id : null;
  const { agents } = useSpaceRosterAgents(
    agentId ? notification.space_id : null
  );
  return agentId ? agents.find((entry) => entry.id === agentId) : undefined;
}

// At import, before any card renders: the name is read with a hook, and a
// hook swapped under a mounted card would change its hook order.
registerNotificationActorName((notification) => {
  const agent = useRosterAgent(notification);
  // The roster says the id when the catalog has no name for it.
  return agent && agent.name !== agent.id ? agent.name : null;
});

export const NotificationAgentFace: NotificationFaceRenderer = ({
  fallback,
  notification,
  size,
}) => {
  const agent = useRosterAgent(notification);
  if (!agent) {
    return <>{fallback}</>;
  }
  return (
    <AgentFace
      avatarUrl={agent.avatarUrl}
      kind={agent.engenty}
      name={agent.name}
      size={size}
    />
  );
};
