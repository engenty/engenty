// The agent's connections as full rows: brand logo, connector name and what
// it is. Name, icon and description come from the connections module's
// catalog through the tools gateway (the same thin slice the workspace
// sidebar reads); an id the catalog does not know keeps its chip label.
// With `onOpen` a row is a button that opens that connector's details.
import type { AgentDeskCapabilityChip } from "@engenty/ai-core/browser";
import { requestApiJson } from "@engenty/api-client";
import { useQuery } from "@engenty/query-client";
import { ConnectorLogoImg, connectorLogoSvg } from "@engenty/ui-icons";
import { Cable, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

interface CatalogConnector {
  description?: string | null;
  icon: string | null;
  id: string;
  name: string;
}

function useConnectorCatalogQuery(enabled: boolean) {
  return useQuery({
    enabled,
    queryFn: async () => {
      const catalog = await requestApiJson<{ connectors: CatalogConnector[] }>(
        "/api/tools/connections_catalog/invoke",
        { body: { input: {} }, method: "POST" }
      );
      return new Map(catalog.connectors.map((entry) => [entry.id, entry]));
    },
    queryKey: ["ai-ui", "agent-connector-rows"],
    staleTime: 30_000,
  });
}

export function AgentConnectorRows({
  connectors,
  empty,
  onOpen,
}: {
  connectors: AgentDeskCapabilityChip[];
  empty: string;
  onOpen?: (connectorId: string) => void;
}) {
  const catalog = useConnectorCatalogQuery(connectors.length > 0);
  if (connectors.length === 0) {
    return <p className="text-muted-foreground text-sm">{empty}</p>;
  }
  return (
    <ul className="-my-1 divide-y divide-border-soft">
      {connectors.map((chip) => {
        const entry = catalog.data?.get(chip.id);
        const icon = entry?.icon ?? null;
        return (
          <li key={chip.id}>
            <RowShell onClick={onOpen ? () => onOpen(chip.id) : undefined}>
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border-soft bg-background">
                {connectorLogoSvg(icon) ? (
                  <ConnectorLogoImg
                    className="size-5 object-contain"
                    icon={icon}
                    size={20}
                  />
                ) : (
                  <Cable
                    aria-hidden
                    className="size-4 text-muted-foreground opacity-80"
                  />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-sm">
                  {entry?.name ?? chip.label}
                </span>
                {entry?.description ? (
                  <span className="block truncate text-muted-foreground text-xs">
                    {entry.description}
                  </span>
                ) : null}
              </span>
            </RowShell>
          </li>
        );
      })}
    </ul>
  );
}

function RowShell({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick?: () => void;
}) {
  const className = "flex w-full min-w-0 items-center gap-3 py-2 text-left";
  if (!onClick) {
    return <div className={className}>{children}</div>;
  }
  return (
    <button
      className={`${className} -mx-2 rounded-md px-2 transition-colors hover:bg-muted/50`}
      onClick={onClick}
      type="button"
    >
      {children}
      <ChevronRight
        aria-hidden
        className="size-4 shrink-0 text-muted-foreground"
      />
    </button>
  );
}
