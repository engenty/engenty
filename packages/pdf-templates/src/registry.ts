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
