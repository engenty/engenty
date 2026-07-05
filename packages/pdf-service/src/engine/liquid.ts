import { Liquid } from "liquidjs";
import type { PdfStyleObject, PdfStylingInput, TemplateData } from "../types";
import { deepMerge } from "./styles";

const liquid = new Liquid({ strictFilters: false, strictVariables: false });

export async function renderLiquidTemplate(
  template: string,
  data: TemplateData
): Promise<string> {
  return liquid.parseAndRender(template, data);
}

function ensureObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function parseJsonStyles(raw: string): PdfStyleObject {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `Failed to parse styling template output as JSON: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
  return ensureObject(parsed, "Rendered styling template") as PdfStyleObject;
}

export async function resolveStyling(
  styling: PdfStylingInput | undefined,
  data: TemplateData
): Promise<PdfStyleObject> {
  if (!styling) {
    return {};
  }

  if (typeof styling === "string") {
    const rendered = await renderLiquidTemplate(styling, data);
    return parseJsonStyles(rendered);
  }

  if (!("template" in styling || "styles" in styling || "data" in styling)) {
    return styling as PdfStyleObject;
  }

  const inputData = {
    ...data,
    ...(styling.data ?? {}),
  };

  const fromTemplate = styling.template
    ? parseJsonStyles(await renderLiquidTemplate(styling.template, inputData))
    : {};

  return deepMerge(fromTemplate, styling.styles ?? {});
}
