/**
 * Resolve plugins that transitively require a given plugin (via `requires`
 * matching its id / `module.<id>` / `provides`). Used before deactivation.
 */

export interface PluginDependencyNode {
  enabled: boolean;
  id: string;
  mandatory: boolean;
  name: string;
  provides: string[];
  requires: string[];
}

function providedTokens(plugin: PluginDependencyNode): Set<string> {
  return new Set([plugin.id, `module.${plugin.id}`, ...plugin.provides]);
}

/** Enabled plugins that (transitively) require `pluginId`, deepest dependents first. */
export function collectEnabledDependents(
  pluginId: string,
  plugins: PluginDependencyNode[]
): PluginDependencyNode[] {
  const byId = new Map(plugins.map((plugin) => [plugin.id, plugin]));
  const root = byId.get(pluginId);
  if (!root) {
    return [];
  }

  const ordered: PluginDependencyNode[] = [];
  const seen = new Set<string>([pluginId]);
  const queue = [pluginId];

  while (queue.length > 0) {
    const currentId = queue.shift();
    if (!currentId) {
      continue;
    }
    const current = byId.get(currentId);
    if (!current) {
      continue;
    }
    const provided = providedTokens(current);
    for (const candidate of plugins) {
      if (seen.has(candidate.id) || !candidate.enabled) {
        continue;
      }
      const matched = candidate.requires.some((requirement) =>
        provided.has(requirement)
      );
      if (!matched) {
        continue;
      }
      seen.add(candidate.id);
      ordered.push(candidate);
      queue.push(candidate.id);
    }
  }

  // Dependents first (reverse BFS discovery) so cascade disable is safer.
  return ordered.reverse();
}
