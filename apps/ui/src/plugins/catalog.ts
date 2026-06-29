import type {
  PluginSourceInfo,
  UiPluginRegistrar,
  UiPluginSummary,
} from "@engenty/ui-plugin-sdk";
import { uiPluginCatalog as generatedUiPluginCatalog } from "./generated-catalog";
import {
  createBlockedUiPluginLoader,
  createGeneratedUiPluginCatalogEntry,
  createRuntimeUiPluginLoader,
  type UiPluginLoadFunction,
} from "./runtime-ui-loader";

export interface GeneratedUiPluginImport {
  exportName: string;
  importPath: string;
  loadModule?: () => Promise<Record<string, unknown>>;
}

export interface UiPluginCatalogEntry {
  generatedImport?: GeneratedUiPluginImport;
  id: string;
  loadUiPlugin: UiPluginLoadFunction;
  optionalPluginIds?: string[];
  sourceInfo?: PluginSourceInfo;
}

type UiPluginCatalogSummary = UiPluginSummary & {
  capabilities?: {
    ai?: boolean;
    frontendTools?: boolean;
    operations?: boolean;
    ui?: boolean;
  };
  kind?: string;
  manifestPath?: string;
  name?: string;
  optional?: string[];
  packageName?: string;
  rootDir?: string;
  source?: string;
  sourceType?: PluginSourceInfo["sourceType"];
  ui?: {
    assetOrigins?: string[];
    enabled?: boolean;
    entry: string;
    export?: string;
    load?: "runtime" | "workspace";
    staticAssets?: string[];
  };
  version?: string;
};

export function createStaticUiCatalogEntry(
  id: string,
  registerUiPlugin: UiPluginRegistrar,
  optionalPluginIds: string[] = []
): UiPluginCatalogEntry {
  return {
    id,
    loadUiPlugin: async () => registerUiPlugin,
    optionalPluginIds,
  };
}

function normalizeStringArray(value: readonly string[] | undefined) {
  return (value ?? [])
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function sourceInfoForPlugin(
  plugin: UiPluginCatalogSummary,
  generatedSourceInfo: PluginSourceInfo | undefined
): PluginSourceInfo | undefined {
  const uiEntry = plugin.ui?.entry.trim();
  if (!uiEntry) {
    return generatedSourceInfo;
  }
  return {
    pluginId: plugin.id,
    packageName: plugin.packageName ?? generatedSourceInfo?.packageName,
    version: plugin.version ?? generatedSourceInfo?.version,
    sourceType:
      plugin.sourceType ?? generatedSourceInfo?.sourceType ?? "module",
    rootDir: plugin.rootDir ?? generatedSourceInfo?.rootDir ?? "",
    source: uiEntry,
    manifestPath:
      plugin.manifestPath ?? generatedSourceInfo?.manifestPath ?? "",
    manifestId: plugin.id,
    registrationKind: "ui.plugin",
  };
}

function generatedImportFor(entry: UiPluginCatalogEntry) {
  if (entry.generatedImport) {
    return entry.generatedImport;
  }
  if (!entry.sourceInfo?.source) {
    return;
  }
  return {
    importPath: entry.sourceInfo.source,
    exportName: "",
  };
}

function hasAuthoritativeManifestSummary(plugin: UiPluginCatalogSummary) {
  return Boolean(
    plugin.ui ||
      plugin.manifestPath ||
      plugin.rootDir ||
      plugin.source ||
      plugin.sourceType ||
      plugin.packageName
  );
}

function isTrustedGeneratedSource(
  plugin: UiPluginCatalogSummary,
  generatedSourceInfo: PluginSourceInfo | undefined
) {
  const sourceType = plugin.sourceType ?? generatedSourceInfo?.sourceType;
  const packageName = plugin.packageName ?? generatedSourceInfo?.packageName;
  return sourceType === "module" || packageName?.startsWith("@engenty/");
}

function isRemoteReference(value: string) {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(value) || value.startsWith("//");
}

function isCompiledRuntimeEntry(value: string) {
  return /\.(?:cjs|js|mjs)$/i.test(value);
}

function isLocalRelativeReference(value: string) {
  return value.startsWith("./") || value.startsWith("../");
}

function hasBlockedUiAssetPolicy(
  ui: NonNullable<UiPluginCatalogSummary["ui"]>
) {
  return (
    (ui.staticAssets ?? []).some((asset) => isRemoteReference(asset)) ||
    (ui.assetOrigins ?? []).some((origin) => origin !== "self")
  );
}

function runtimeUiEntryUrl(pluginId: string) {
  return `/api/plugins/${encodeURIComponent(pluginId)}/ui/plugin.js`;
}

function runtimeUiAssetUrls(pluginId: string, assets: readonly string[]) {
  return assets.map((asset, index) => {
    const filename = asset.split("/").pop() || `asset-${index}`;
    return `/api/plugins/${encodeURIComponent(pluginId)}/ui/assets/${index}/${encodeURIComponent(filename)}`;
  });
}

function createPolicyBlockedCatalogEntry(params: {
  code: string;
  message: string;
  optionalPluginIds: string[];
  pluginId: string;
  remediation: string;
  sourceInfo?: PluginSourceInfo;
}): UiPluginCatalogEntry {
  return {
    id: params.pluginId,
    loadUiPlugin: createBlockedUiPluginLoader({
      code: params.code,
      message: params.message,
      pluginId: params.pluginId,
      remediation: params.remediation,
    }),
    optionalPluginIds: params.optionalPluginIds,
    sourceInfo: params.sourceInfo,
  };
}

function createManifestDerivedCatalogEntry(params: {
  generatedEntry?: UiPluginCatalogEntry;
  plugin: UiPluginCatalogSummary;
}): UiPluginCatalogEntry | null {
  const ui = params.plugin.ui;
  if (!ui || ui.enabled === false) {
    return null;
  }

  const importPath = ui.entry.trim();
  const exportName = ui.export?.trim() || "default";
  if (!importPath) {
    return null;
  }

  const generatedEntry = params.generatedEntry;
  const generatedImport = generatedEntry
    ? generatedImportFor(generatedEntry)
    : undefined;
  const load = ui.load ?? "runtime";
  const optionalPluginIds = normalizeStringArray(params.plugin.optional);
  const sourceInfo = sourceInfoForPlugin(
    params.plugin,
    params.generatedEntry?.sourceInfo
  );

  if (params.plugin.capabilities?.ui !== true) {
    return createPolicyBlockedCatalogEntry({
      pluginId: params.plugin.id,
      code: "plugin.ui.capability_blocked",
      message: `UI plugin "${params.plugin.id}" declares a UI entry but does not declare capabilities.ui true.`,
      remediation:
        "Declare capabilities.ui true in engenty.plugin.json before exposing UI contributions.",
      optionalPluginIds,
      sourceInfo,
    });
  }

  if (hasBlockedUiAssetPolicy(ui)) {
    return createPolicyBlockedCatalogEntry({
      pluginId: params.plugin.id,
      code: "plugin.ui.static_asset_origin_blocked",
      message: `UI plugin "${params.plugin.id}" declares static asset metadata that is not enabled in this Phase 08 slice.`,
      remediation:
        "Use packaged local UI assets until signed asset origin policy is implemented.",
      optionalPluginIds,
      sourceInfo,
    });
  }

  if (isRemoteReference(importPath)) {
    return createPolicyBlockedCatalogEntry({
      pluginId: params.plugin.id,
      code: "plugin.ui.remote_bundle_blocked",
      message: `UI plugin "${params.plugin.id}" declares a remote UI entry, which is not enabled in this Phase 08 slice.`,
      remediation:
        'Use ui.load "workspace" for generated static imports or ui.load "runtime" with a local compiled package artifact.',
      optionalPluginIds,
      sourceInfo,
    });
  }

  if (load === "runtime") {
    if (
      !(
        isLocalRelativeReference(importPath) &&
        isCompiledRuntimeEntry(importPath)
      )
    ) {
      return createPolicyBlockedCatalogEntry({
        pluginId: params.plugin.id,
        code: "plugin.ui.runtime_entry_invalid",
        message: `UI plugin "${params.plugin.id}" declares ui.load "runtime" without a local compiled JavaScript entry.`,
        remediation:
          "Point ui.entry at a relative .js, .mjs, or .cjs file under the package root.",
        optionalPluginIds,
        sourceInfo,
      });
    }
    return {
      id: params.plugin.id,
      loadUiPlugin: createRuntimeUiPluginLoader({
        importUrl: runtimeUiEntryUrl(params.plugin.id),
        pluginId: params.plugin.id,
        exportName,
        staticAssetUrls: runtimeUiAssetUrls(
          params.plugin.id,
          ui.staticAssets ?? []
        ),
      }),
      optionalPluginIds,
      sourceInfo,
    };
  }

  if (
    generatedEntry &&
    generatedImport?.importPath === importPath &&
    generatedImport.loadModule
  ) {
    if (!isTrustedGeneratedSource(params.plugin, generatedEntry?.sourceInfo)) {
      return createPolicyBlockedCatalogEntry({
        pluginId: params.plugin.id,
        code: "plugin.ui.trust_blocked",
        message: `UI plugin "${params.plugin.id}" matched a generated import but is not trusted for browser execution in this Phase 08 slice.`,
        remediation:
          "Use a workspace module, first-party @engenty package, or keep the UI bundle disabled until package trust review is implemented for browser loading.",
        optionalPluginIds,
        sourceInfo,
      });
    }

    return createGeneratedUiPluginCatalogEntry({
      pluginId: params.plugin.id,
      importPath,
      exportName,
      loadModule: generatedImport.loadModule,
      loadStatic: () => generatedEntry.loadUiPlugin(),
      optionalPluginIds,
      sourceInfo,
    });
  }

  return createPolicyBlockedCatalogEntry({
    pluginId: params.plugin.id,
    code: "plugin.ui.workspace_import_missing",
    message: `UI plugin "${params.plugin.id}" declares ui.load "workspace" but no matching generated catalog import is available.`,
    remediation:
      "Add the package to apps/ui/package.json, regenerate plugin artifacts, and keep ui.entry aligned with the generated static import.",
    optionalPluginIds,
    sourceInfo,
  });
}

export function deriveUiPluginCatalogFromSummaries(params: {
  generatedCatalog?: readonly UiPluginCatalogEntry[];
  plugins: readonly UiPluginCatalogSummary[];
}): UiPluginCatalogEntry[] {
  const generatedCatalog = params.generatedCatalog ?? generatedUiPluginCatalog;
  const generatedById = new Map(
    generatedCatalog.map((entry) => [entry.id, entry])
  );
  const pluginsById = new Map(
    params.plugins.map((plugin) => [plugin.id, plugin])
  );
  const derived: UiPluginCatalogEntry[] = [];
  const consumed = new Set<string>();

  for (const generatedEntry of generatedCatalog) {
    const plugin = pluginsById.get(generatedEntry.id);
    if (!plugin) {
      derived.push(generatedEntry);
      continue;
    }

    consumed.add(plugin.id);
    if (!hasAuthoritativeManifestSummary(plugin)) {
      derived.push(generatedEntry);
      continue;
    }

    const manifestEntry = createManifestDerivedCatalogEntry({
      generatedEntry,
      plugin,
    });
    if (manifestEntry) {
      derived.push(manifestEntry);
    } else if (
      plugin.capabilities?.ui === true &&
      !plugin.ui &&
      generatedEntry.generatedImport?.loadModule
    ) {
      derived.push(generatedEntry);
    }
  }

  for (const plugin of params.plugins) {
    if (consumed.has(plugin.id) || !plugin.ui) {
      continue;
    }
    const manifestEntry = createManifestDerivedCatalogEntry({
      generatedEntry: generatedById.get(plugin.id),
      plugin,
    });
    if (manifestEntry) {
      derived.push(manifestEntry);
    }
  }

  return derived;
}

export const uiPluginCatalog: UiPluginCatalogEntry[] = generatedUiPluginCatalog;
