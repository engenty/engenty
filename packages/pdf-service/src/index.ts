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
  CreateInvoicePdfOptions,
  LegacyInvoiceInput,
  PdfStyleObject,
  PreparedPdfTemplatePreview,
  PreparePdfTemplatePreviewOptions,
  RenderPdfTemplateOptions,
} from "./types";

export type {
  CreateInvoicePdfOptions,
  LegacyInvoiceInput as Invoice,
  PdfStyleObject,
  PdfStylingInput,
  PreparedPdfTemplatePreview,
  PreparePdfTemplatePreviewOptions,
  RenderPdfTemplateOptions,
  TemplateData,
} from "./types";

const LEGACY_DOCUMENT_TEMPLATE = `<Document>
  <Page size="A4" style="page">
    <View style="header">
      <Text style="title">Invoice {{ invoice.number }}</Text>
      <Text style="muted">Date: {{ invoice.date }}</Text>
      <Text style="muted">Due Date: {{ invoice.dueDate }}</Text>
    </View>
    <View style="section">
      <Text style="sectionTitle">Content</Text>
      <Text style="text">{{ invoice.content }}</Text>
    </View>
    <View style="totals">
      <Text style="text">Sum Netto: {{ invoice.sumNettoFormatted }}</Text>
      <Text style="text">Tax: {{ invoice.taxFormatted }}</Text>
      <Text style="total">Sum Brutto: {{ invoice.sumBruttoFormatted }}</Text>
    </View>
  </Page>
</Document>`;

const LEGACY_STYLES: PdfStyleObject = {
  page: {
    padding: 50,
    fontSize: 10,
    color: "#000000",
    fontFamily: "Helvetica",
  },
  header: { marginBottom: 18 },
  title: { fontSize: 18, fontWeight: 700, marginBottom: 8 },
  muted: { marginBottom: 4 },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 12, fontWeight: 700, marginBottom: 8 },
  text: { marginBottom: 6, lineHeight: 1.4 },
  totals: { marginTop: 10 },
  total: { marginTop: 8, fontSize: 12, fontWeight: 700 },
};

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

/**
 * Backward-compatible invoice helper.
 * Prefer renderPdfTemplate() with templates owned by caller modules.
 */
export async function createInvoicePdf(
  invoice: LegacyInvoiceInput,
  options?: CreateInvoicePdfOptions
): Promise<Buffer | string> {
  const formatNumber = (n: number) =>
    new Intl.NumberFormat("en-US", { minimumFractionDigits: 2 }).format(n);

  return renderPdfTemplate({
    documentTemplateXml: LEGACY_DOCUMENT_TEMPLATE,
    data: {
      invoice: {
        ...invoice,
        sumNettoFormatted: formatNumber(invoice.sumNetto),
        taxFormatted: formatNumber(invoice.tax),
        sumBruttoFormatted: formatNumber(invoice.sumBrutto),
      },
    },
    styling: LEGACY_STYLES,
    outputPath: options?.outputPath,
  });
}
