import type {
  PdfTemplateServerProvider,
  PdfTemplateUiProvider,
} from "./types.js";

const uiProviders = new Map<string, PdfTemplateUiProvider>();
const serverProviders = new Map<string, PdfTemplateServerProvider>();

export function registerPdfTemplateUiProvider(provider: PdfTemplateUiProvider) {
  uiProviders.set(provider.moduleKey, provider);
}

export function registerPdfTemplateServerProvider(
  provider: PdfTemplateServerProvider
) {
  serverProviders.set(provider.moduleKey, provider);
}

export function getPdfTemplateUiProviders(): PdfTemplateUiProvider[] {
  return [...uiProviders.values()].sort((a, b) =>
    a.label.localeCompare(b.label)
  );
}

export function getPdfTemplateUiProvider(moduleKey: string) {
  return uiProviders.get(moduleKey) ?? null;
}

export function getPdfTemplateServerProvider(moduleKey: string) {
  return serverProviders.get(moduleKey) ?? null;
}

export function resetPdfTemplateRegistries() {
  uiProviders.clear();
  serverProviders.clear();
}

/**
 * Markup that matches the provider's built-in default is stored as NULL so
 * the tenant keeps following provider improvements until they actually edit
 * it. Fields left undefined (PATCH semantics) pass through untouched, as does
 * everything when no server provider is registered for the module.
 */
export function normalizePdfTemplateMarkup(
  moduleKey: string,
  markup: {
    document_template?: string | null;
    stylesheet_template?: string | null;
  }
): {
  document_template?: string | null;
  stylesheet_template?: string | null;
} {
  const provider = serverProviders.get(moduleKey);
  if (!provider) {
    return markup;
  }
  const normalize = (value: string | null | undefined, fallback: string) =>
    typeof value === "string" && value.trim() === fallback.trim()
      ? null
      : value;
  return {
    document_template: normalize(
      markup.document_template,
      provider.defaultDocumentTemplate
    ),
    stylesheet_template: normalize(
      markup.stylesheet_template,
      provider.defaultStylesheetTemplate
    ),
  };
}
