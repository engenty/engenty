import type { AgentPluginPanelProps } from "../../extensions.js";
import { PluginMarketplace } from "./plugin-marketplace.js";

/** The marketplace for an agent's Space (agent desk "Connect" dialog). */
export function AgentPluginMarketplacePanel({
  agentId,
  detailsId,
  onDetailsIdChange,
  spaceId,
}: AgentPluginPanelProps) {
  return (
    <PluginMarketplace
      agentId={agentId}
      detailsId={detailsId}
      onDetailsIdChange={onDetailsIdChange}
      spaceId={spaceId}
    />
  );
}
