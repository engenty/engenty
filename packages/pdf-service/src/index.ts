import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pdf, StyleSheet } from "@react-pdf/renderer";
import { xmlToAst } from "./engine/ast";
import { ensureThemeFonts, type FontManifestItem } from "./engine/fonts.js";
import { renderLiquidTemplate, resolveStyling } from "./engine/liquid";
import { renderAst } from "./engine/render";
import { normalizeStyles } from "./engine/styles";
import type {
  PreparedPdfTemplatePreview,
  PreparePdfTemplatePreviewOptions,
  RenderPdfTemplateOptions,
} from "./types";

export type {
  PdfStyleObject,
  PdfStylingInput,
  PreparedPdfTemplatePreview,
  PreparePdfTemplatePreviewOptions,
  RenderPdfTemplateOptions,
  TemplateData,
} from "./types";

async function toBuffer(maybeBuffer: unknown): Promise<Buffer> {
  if (Buffer.isBuffer(maybeBuffer)) {
    return maybeBuffer;
  }
  if (maybeBuffer instanceof Uint8Array) {
    return Buffer.from(maybeBuffer);
  }
  if (maybeBuffer instanceof ArrayBuffer) {
    return Buffer.from(maybeBuffer);
  }
  if (
    maybeBuffer instanceof Readable ||
    (maybeBuffer as { [Symbol.asyncIterator]?: unknown })?.[
      Symbol.asyncIterator
    ]
  ) {
    const chunks: Uint8Array[] = [];
    for await (const chunk of maybeBuffer as AsyncIterable<
      Uint8Array | Buffer | string
    >) {
      if (typeof chunk === "string") {
        chunks.push(Buffer.from(chunk));
      } else {
        chunks.push(Buffer.from(chunk));
      }
    }
    return Buffer.concat(chunks.map((c) => Buffer.from(c)));
  }
  throw new Error("Unsupported PDF output type");
}

export async function preparePdfTemplatePreview(
  options: PreparePdfTemplatePreviewOptions
): Promise<PreparedPdfTemplatePreview> {
  const renderedXml = await renderLiquidTemplate(
    options.documentTemplateXml,
    options.data
  );
  await resolveStyling(options.styling, options.data);
  return { renderedXml };
}

export async function renderPdfTemplate(
  options: RenderPdfTemplateOptions
): Promise<Buffer | string> {
  const { renderedXml } = await preparePdfTemplatePreview(options);

  // Extract theme from data (if present) for font registration
  const theme = (
    options.data as { theme?: { fonts?: Record<string, { family?: string }> } }
  )?.theme;
  const fontManifest = (options.data as { fontManifest?: FontManifestItem[] })
    ?.fontManifest;

  // Register fonts BEFORE creating stylesheet (fonts must be registered before use)
  if (theme || fontManifest) {
    ensureThemeFonts(theme || {}, fontManifest || []);
  }

  const styleObject = await resolveStyling(options.styling, options.data);
  const normalized = normalizeStyles(styleObject);
  const styleSheet = StyleSheet.create(
    normalized as Parameters<typeof StyleSheet.create>[0]
  );
  const ast = xmlToAst(renderedXml);
  const doc = renderAst(ast, styleSheet);
  const output = await pdf(doc as Parameters<typeof pdf>[0]).toBuffer();
  const buffer = await toBuffer(output);

  if (options.outputPath) {
    await fs.mkdir(path.dirname(options.outputPath), { recursive: true });
    await fs.writeFile(options.outputPath, buffer);
    return options.outputPath;
  }

  return buffer;
}
