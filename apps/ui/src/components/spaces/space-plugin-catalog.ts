import type {
  SpaceCatalogConnector,
  SpaceMount,
} from "@/lib/api/spaces-client";
import type { SpaceCatalogItem } from "./space-mount-catalog";

/**
 * Connector definitions (builtins + this tenant's imports) as mountable
 * plugin ids. No account is required — that is the `plugin` mount kind.
 */
export function pluginsFromConnectors(
  connectors: readonly SpaceCatalogConnector[],
  mounts: readonly SpaceMount[]
): SpaceCatalogItem[] {
  const known = new Set<string>();
  const items: SpaceCatalogItem[] = [];
  for (const connector of connectors) {
    known.add(connector.id);
    items.push({
      category: "integrations",
      connectorId: connector.id,
      description: connector.description ?? null,
      id: connector.id,
      name: connector.title ?? connector.name ?? connector.id,
    });
  }
  for (const mount of mounts) {
    if (mount.resourceType !== "plugin" || known.has(mount.resourceKey)) {
      continue;
    }
    items.push({
      category: "integrations",
      connectorId: mount.resourceKey,
      id: mount.resourceKey,
      name: mount.resourceKey,
    });
  }
  return items;
}
