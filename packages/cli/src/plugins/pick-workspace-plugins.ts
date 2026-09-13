import { isMandatoryPlugin } from "@engenty/environment";
import { isInteractiveTerminal, runMultiSelectLoop } from "../select-loop.js";
import {
  enablePluginsInProduct,
  listPluginManifestEntries,
  type PluginManifestEntry,
} from "./plugins-manifest-ops.js";

function entryHint(entry: PluginManifestEntry): string {
  return [
    entry.enabled ? "installed" : "available",
    entry.onDisk ? "on-disk" : "missing",
    entry.hasUi ? "ui" : "no-ui",
  ].join(" · ");
}

/** Workspace modules on disk that are not yet installed (enabled). */
export function listInstallableWorkspaceEntries(
  repoRoot: string
): PluginManifestEntry[] {
  return listPluginManifestEntries(repoRoot).filter(
    (e) => e.onDisk && !e.enabled
  );
}

/** Workspace modules currently installed (enabled in engenty.plugins). */
export function listInstalledWorkspaceEntries(
  repoRoot: string
): PluginManifestEntry[] {
  return listPluginManifestEntries(repoRoot).filter((e) => e.enabled);
}

/** Interactive multi-select over workspace module slugs (in-repo). */
export function pickWorkspaceSlugs(params: {
  entries: PluginManifestEntry[];
  verb: string;
}): Promise<string[] | "cancelled"> {
  return runMultiSelectLoop({
    title: `Select plugins to ${params.verb}`,
    doneVerb: params.verb,
    // Install defaults to all-checked ("install them all"); uninstall defaults
    // to none-checked so it never proposes removing everything.
    preselect:
      params.verb === "install"
        ? params.entries.map((entry) => entry.slug)
        : [],
    options: params.entries.map((entry) => ({
      value: entry.slug,
      label: entry.slug,
      hint: entryHint(entry),
    })),
  });
}

/**
 * Offer an interactive plugin install when the workspace has no plugins
 * installed yet (fresh clone/purge). Writes the manifest only — the caller's
 * setup step composes artifacts. No-op in non-interactive shells, when forced
 * off, or when plugins are already installed.
 */
export function maybeInstallWorkspacePluginsInteractively(params: {
  repoRoot: string;
  skip?: boolean;
}): Promise<void> {
  return (async () => {
    if (params.skip || !isInteractiveTerminal()) {
      return;
    }
    // Only prompt on a fresh workspace — i.e. before any *optional* plugin has
    // been chosen. Mandatory plugins (copilot, tenant/user-settings) are always
    // in the manifest and don't count, so their presence must not suppress the
    // prompt. Ongoing changes go through `engenty plugins install/uninstall`.
    const installedOptional = listInstalledWorkspaceEntries(
      params.repoRoot
    ).filter((entry) => !isMandatoryPlugin(entry.slug));
    if (installedOptional.length > 0) {
      return;
    }
    const installable = listInstallableWorkspaceEntries(params.repoRoot);
    if (installable.length === 0) {
      return;
    }
    const picked = await pickWorkspaceSlugs({
      entries: installable,
      verb: "install",
    });
    if (picked === "cancelled" || picked.length === 0) {
      return;
    }
    // Manifest only — the setup compose that follows handles install + artifacts.
    enablePluginsInProduct({
      repoRoot: params.repoRoot,
      slugs: picked,
      runInstall: false,
      runSetup: false,
    });
    console.log(`Installed ${picked.length} plugin(s): ${picked.join(", ")}`);
  })();
}
