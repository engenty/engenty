import type {
  PluginSourceInfo,
  UiPluginRegistrar,
} from "@engenty/ui-plugin-sdk";

export interface UiPluginLoadContext {
  generationId?: number;
  isGenerationCurrent?: (
    generationId: number | undefined,
    pluginId: string
  ) => boolean;
}

export type UiPluginLoadFunction = (
  context?: UiPluginLoadContext
) => Promise<UiPluginRegistrar>;

export class UiPluginRuntimeLoadError extends Error {
  readonly code: string;
  readonly pluginId: string;
  readonly remediation: string;

  constructor(params: {
    code: string;
    message: string;
    pluginId: string;
    remediation: string;
  }) {
    super(params.message);
    this.name = "UiPluginRuntimeLoadError";
    this.code = params.code;
    this.pluginId = params.pluginId;
    this.remediation = params.remediation;
  }
}

interface GeneratedUiPluginLoaderParams {
  exportName: string;
  importPath: string;
  loadModule?: () => Promise<Record<string, unknown>>;
  loadStatic: () => Promise<UiPluginRegistrar>;
  pluginId: string;
}

interface GeneratedUiPluginCatalogEntryParams
  extends GeneratedUiPluginLoaderParams {
  optionalPluginIds?: string[];
  sourceInfo?: PluginSourceInfo;
}

interface RuntimeUiPluginLoaderParams {
  exportName: string;
  importRuntimeModule?: (url: string) => Promise<Record<string, unknown>>;
  importUrl: string;
  pluginId: string;
  staticAssetUrls?: string[];
}

function generationCacheKey(
  pluginId: string,
  generationId: number | undefined
) {
  return `${pluginId}@${generationId ?? "unknown"}`;
}

function assertCurrentGeneration(
  params: Pick<GeneratedUiPluginLoaderParams, "pluginId"> & {
    context?: UiPluginLoadContext;
  }
) {
  if (
    params.context?.isGenerationCurrent?.(
      params.context.generationId,
      params.pluginId
    ) === false
  ) {
    throw new UiPluginRuntimeLoadError({
      code: "plugin.ui.stale_generation",
      pluginId: params.pluginId,
      message: `UI plugin "${params.pluginId}" was not registered because generation ${params.context.generationId ?? "unknown"} is stale.`,
      remediation:
        "Ignore the stale UI resolution and refetch plugin contributions for the active generation.",
    });
  }
}

function resolvePluginExport(params: {
  moduleNamespace: Record<string, unknown>;
  pluginId: string;
  exportName: string;
  importPath: string;
}) {
  const plugin = params.moduleNamespace[params.exportName];
  const exportLabel =
    params.exportName === "default"
      ? "default export"
      : `export "${params.exportName}"`;
  if (typeof plugin !== "function") {
    throw new UiPluginRuntimeLoadError({
      code: "plugin.ui.invalid_plugin",
      pluginId: params.pluginId,
      message: `UI plugin "${params.pluginId}" ${exportLabel} from "${params.importPath}" is not a plugin function.`,
      remediation:
        'Export a UI plugin function from the manifest-declared UI entry; conventional plugins use the "default" export.',
    });
  }
  return plugin as UiPluginRegistrar;
}

export function createGeneratedUiPluginLoader(
  params: GeneratedUiPluginLoaderParams
): UiPluginLoadFunction {
  const cache = new Map<string, Promise<UiPluginRegistrar>>();

  return async (context) => {
    assertCurrentGeneration({ context, pluginId: params.pluginId });

    const key = generationCacheKey(params.pluginId, context?.generationId);
    const cached = cache.get(key);
    if (cached) {
      return cached;
    }

    const promise = (
      params.loadModule
        ? params.loadModule().then((moduleNamespace) =>
            resolvePluginExport({
              importPath: params.importPath,
              moduleNamespace,
              pluginId: params.pluginId,
              exportName: params.exportName,
            })
          )
        : params.loadStatic()
    )
      .then((plugin) => {
        assertCurrentGeneration({ context, pluginId: params.pluginId });
        if (typeof plugin !== "function") {
          const exportLabel =
            params.exportName === "default"
              ? "default export"
              : `export "${params.exportName}"`;
          throw new UiPluginRuntimeLoadError({
            code: "plugin.ui.invalid_plugin",
            pluginId: params.pluginId,
            message: `UI plugin "${params.pluginId}" ${exportLabel} from "${params.importPath}" is not a plugin function.`,
            remediation:
              'Export a UI plugin function from the manifest-declared UI entry; conventional plugins use the "default" export.',
          });
        }
        return plugin;
      })
      .catch((error) => {
        cache.delete(key);
        throw error;
      });

    cache.set(key, promise);
    return promise;
  };
}

export function createGeneratedUiPluginCatalogEntry(
  params: GeneratedUiPluginCatalogEntryParams
) {
  return {
    id: params.pluginId,
    loadUiPlugin: createGeneratedUiPluginLoader(params),
    optionalPluginIds: params.optionalPluginIds ?? [],
    generatedImport: {
      importPath: params.importPath,
      loadModule: params.loadModule,
      exportName: params.exportName,
    },
    sourceInfo: params.sourceInfo,
  };
}

function appendGenerationQuery(url: string, generationId: number | undefined) {
  if (typeof generationId !== "number") {
    return url;
  }
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}generationId=${encodeURIComponent(String(generationId))}`;
}

function ensureRuntimeCssAssets(params: {
  generationId: number | undefined;
  pluginId: string;
  staticAssetUrls: readonly string[];
}) {
  if (typeof document === "undefined") {
    return;
  }

  const activeGeneration = String(params.generationId ?? "unknown");
  for (const existing of Array.from(
    document.querySelectorAll<HTMLLinkElement>(
      `link[data-engenty-plugin-ui-asset="${params.pluginId}"]`
    )
  )) {
    if (existing.dataset.engentyPluginGeneration !== activeGeneration) {
      existing.remove();
    }
  }

  for (const assetUrl of params.staticAssetUrls) {
    const href = appendGenerationQuery(assetUrl, params.generationId);
    const alreadyLoaded = document.querySelector(
      `link[data-engenty-plugin-ui-asset="${params.pluginId}"][href="${href}"]`
    );
    if (alreadyLoaded) {
      continue;
    }
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.dataset.engentyPluginUiAsset = params.pluginId;
    link.dataset.engentyPluginGeneration = activeGeneration;
    document.head.appendChild(link);
  }
}

async function importRuntimeModule(url: string) {
  return (await import(/* @vite-ignore */ url)) as Record<string, unknown>;
}

export function createRuntimeUiPluginLoader(
  params: RuntimeUiPluginLoaderParams
): UiPluginLoadFunction {
  const cache = new Map<string, Promise<UiPluginRegistrar>>();
  const loadModule = params.importRuntimeModule ?? importRuntimeModule;

  return async (context) => {
    assertCurrentGeneration({ context, pluginId: params.pluginId });

    const key = generationCacheKey(params.pluginId, context?.generationId);
    const cached = cache.get(key);
    if (cached) {
      return cached;
    }

    const importUrl = appendGenerationQuery(
      params.importUrl,
      context?.generationId
    );
    const promise = loadModule(importUrl)
      .then((moduleNamespace) => {
        assertCurrentGeneration({ context, pluginId: params.pluginId });
        ensureRuntimeCssAssets({
          generationId: context?.generationId,
          pluginId: params.pluginId,
          staticAssetUrls: params.staticAssetUrls ?? [],
        });
        return resolvePluginExport({
          importPath: importUrl,
          moduleNamespace,
          pluginId: params.pluginId,
          exportName: params.exportName,
        });
      })
      .catch((error) => {
        cache.delete(key);
        throw error;
      });

    cache.set(key, promise);
    return promise;
  };
}

export function createDeferredRuntimeUiPluginLoader(params: {
  importPath: string;
  pluginId: string;
}): UiPluginLoadFunction {
  return async () => {
    throw new UiPluginRuntimeLoadError({
      code: "plugin.ui.runtime_bundle_deferred",
      pluginId: params.pluginId,
      message: `Runtime UI bundle loading for "${params.pluginId}" from "${params.importPath}" is not enabled in this Phase 08 slice.`,
      remediation:
        "Serve the compiled UI bundle through the core same-origin asset pipeline before enabling browser runtime imports.",
    });
  };
}

export function createBlockedUiPluginLoader(params: {
  code: string;
  message: string;
  pluginId: string;
  remediation: string;
}): UiPluginLoadFunction {
  return async () => {
    throw new UiPluginRuntimeLoadError({
      code: params.code,
      pluginId: params.pluginId,
      message: params.message,
      remediation: params.remediation,
    });
  };
}
