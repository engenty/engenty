import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  type PdfStyleObject,
  preparePdfTemplatePreview,
  renderPdfTemplate,
} from "./index";

const sampleInvoice = {
  number: "INV-2025-001",
  date: "2025-02-18",
  dueDate: "2025-03-18",
  content: "Consulting services",
  sumNetto: 1000,
  tax: 190,
  sumBrutto: 1190,
};

const documentTemplate = `<Document>
  <Page size="A4" style="page">
    <View style="block">
      <Text style="title">{{ invoice.number }}</Text>
      <Text style="line">Date: {{ invoice.date }}</Text>
      <Text style="line">Due: {{ invoice.dueDate }}</Text>
      <Text style="line">{{ invoice.content }}</Text>
    </View>
  </Page>
</Document>`;

const plainStyles: PdfStyleObject = {
  page: { padding: 48, fontFamily: "Helvetica" },
  block: { gap: 8 },
  title: { fontSize: 16, fontWeight: 700 },
  line: { fontSize: 10 },
};

const tinyTransparentPngBase64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAwMBAS8p0b8AAAAASUVORK5CYII=";

describe("renderPdfTemplate", () => {
  it("renders XML + data with styling template string", async () => {
    const result = await renderPdfTemplate({
      documentTemplateXml: documentTemplate,
      data: {
        invoice: sampleInvoice,
        theme: { textColor: "#111111" },
      },
      styling: `{
        "page": { "padding": "48pt", "fontFamily": "Helvetica" },
        "block": { "marginBottom": "12pt" },
        "title": { "fontSize": "16pt", "fontWeight": 700, "color": "{{ theme.textColor }}" },
        "line": { "fontSize": "10pt" }
      }`,
    });
    expect(result).toBeInstanceOf(Buffer);
    expect((result as Buffer).length).toBeGreaterThan(100);
  });

  it("renders XML + data with plain style object", async () => {
    const result = await renderPdfTemplate({
      documentTemplateXml: documentTemplate,
      data: { invoice: sampleInvoice },
      styling: plainStyles,
    });
    expect(result).toBeInstanceOf(Buffer);
    expect((result as Buffer).length).toBeGreaterThan(100);
  });

  it("prepares rendered XML preview before PDF generation", async () => {
    const preview = await preparePdfTemplatePreview({
      documentTemplateXml: documentTemplate,
      data: {
        invoice: sampleInvoice,
        theme: { textColor: "#123456" },
      },
      styling: `{
        "page": { "padding": "48pt", "fontFamily": "Helvetica" },
        "title": { "color": "{{ theme.textColor }}" }
      }`,
    });

    expect(preview.renderedXml).toContain("INV-2025-001");
    expect(preview.renderedXml).toContain("Consulting services");
  });

  it("prepares previews for Image nodes and renders Link nodes", async () => {
    const tmp = fs.mkdtempSync(
      path.join(os.tmpdir(), "engenty-pdf-image-support-")
    );
    const imagePath = path.join(tmp, "pixel.png");
    fs.writeFileSync(
      imagePath,
      Buffer.from(tinyTransparentPngBase64, "base64")
    );

    try {
      const preview = await preparePdfTemplatePreview({
        documentTemplateXml: `<Document>
          <Page size="A4" style="page">
            <View style="block">
              <Image src="${imagePath}" style="image" />
            </View>
          </Page>
        </Document>`,
        data: {},
        styling: {
          page: { padding: 24, fontFamily: "Helvetica" },
          block: { gap: 8 },
          image: { width: 24, height: 24 },
        },
      });
      expect(preview.renderedXml).toContain(
        `<Image src="${imagePath}" style="image" />`
      );

      const result = await renderPdfTemplate({
        documentTemplateXml: `<Document>
          <Page size="A4" style="page">
            <View style="block">
              <Link href="https://engenty.localhost" style="line">Visit engenty.local</Link>
            </View>
          </Page>
        </Document>`,
        data: {},
        styling: {
          page: { padding: 24, fontFamily: "Helvetica" },
          block: { gap: 8 },
          line: { fontSize: 10 },
        },
      });

      expect(result).toBeInstanceOf(Buffer);
      expect((result as Buffer).length).toBeGreaterThan(100);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
