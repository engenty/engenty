export type TemplateData = Record<string, unknown>;

export type PdfStyleObject = Record<string, Record<string, unknown>>;

export type PdfStylingInput =
  | string
  | PdfStyleObject
  | {
      template?: string;
      styles?: PdfStyleObject;
      data?: TemplateData;
    };

export interface RenderPdfTemplateOptions {
  data: TemplateData;
  documentTemplateXml: string;
  outputPath?: string;
  styling?: PdfStylingInput;
}

export interface PreparePdfTemplatePreviewOptions {
  data: TemplateData;
  documentTemplateXml: string;
  styling?: PdfStylingInput;
}

export interface PreparedPdfTemplatePreview {
  renderedXml: string;
}

export interface LegacyInvoiceInput {
  content: string;
  date: string;
  dueDate: string;
  number: string;
  sumBrutto: number;
  sumNetto: number;
  tax: number;
}

export interface CreateInvoicePdfOptions {
  outputPath?: string;
}

export type NodeAST =
  | { type: "Document"; children: NodeAST[] }
  | {
      type: "Page";
      size?: string;
      style?: string | string[];
      children: NodeAST[];
    }
  | {
      type: "View";
      break?: boolean;
      style?: string | string[];
      children: NodeAST[];
    }
  | { type: "Text"; style?: string | string[]; text: string }
  | {
      type: "Image";
      src?: string;
      style?: string | string[];
    }
  | {
      type: "Link";
      href?: string;
      style?: string | string[];
      text: string;
    };
