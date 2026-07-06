import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createDefaultPdfTemplateSettings } from "./defaults.js";
import {
  normalizePdfTemplateMarkup,
  registerPdfTemplateServerProvider,
  resetPdfTemplateRegistries,
} from "./registry.js";

const DEFAULT_DOC = "<document><text>default</text></document>";
const DEFAULT_STYLE = '{ "page": {} }';

function registerProvider() {
  registerPdfTemplateServerProvider({
    moduleKey: "offers",
    settingsDefaults: createDefaultPdfTemplateSettings(),
    defaultDocumentTemplate: DEFAULT_DOC,
    defaultStylesheetTemplate: DEFAULT_STYLE,
    inputSchema: z.object({}),
    buildSampleData: () => ({}),
  });
}

afterEach(() => {
  resetPdfTemplateRegistries();
});

describe("normalizePdfTemplateMarkup", () => {
  it("stores NULL for markup matching the provider default", () => {
    registerProvider();
    expect(
      normalizePdfTemplateMarkup("offers", {
        document_template: DEFAULT_DOC,
        stylesheet_template: DEFAULT_STYLE,
      })
    ).toEqual({ document_template: null, stylesheet_template: null });
  });

  it("ignores surrounding whitespace when comparing", () => {
    registerProvider();
    expect(
      normalizePdfTemplateMarkup("offers", {
        document_template: `\n${DEFAULT_DOC}\n`,
        stylesheet_template: DEFAULT_STYLE,
      })
    ).toEqual({ document_template: null, stylesheet_template: null });
  });

  it("keeps customized markup verbatim", () => {
    registerProvider();
    const custom = "<document><text>custom</text></document>";
    expect(
      normalizePdfTemplateMarkup("offers", {
        document_template: custom,
        stylesheet_template: DEFAULT_STYLE,
      })
    ).toEqual({ document_template: custom, stylesheet_template: null });
  });

  it("passes through undefined fields (PATCH semantics) and nulls", () => {
    registerProvider();
    expect(
      normalizePdfTemplateMarkup("offers", { document_template: null })
    ).toEqual({ document_template: null, stylesheet_template: undefined });
  });

  it("passes markup through untouched when no provider is registered", () => {
    const markup = {
      document_template: DEFAULT_DOC,
      stylesheet_template: DEFAULT_STYLE,
    };
    expect(normalizePdfTemplateMarkup("unknown", markup)).toEqual(markup);
  });
});
