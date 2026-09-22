import type { PluginMarketplaceProps } from "./plugin-marketplace.js";
import { PluginMarketplace } from "./plugin-marketplace.js";

export function AgentPluginMarketplacePanel({
  agentId,
  detailsId,
  onDetailsIdChange,
}: Pick<
  PluginMarketplaceProps,
  "agentId" | "detailsId" | "onDetailsIdChange"
> & { agentId: string }) {
  return (
    <PluginMarketplace
      agentId={agentId}
      detailsId={detailsId}
      onDetailsIdChange={onDetailsIdChange}
    />
  );
}
