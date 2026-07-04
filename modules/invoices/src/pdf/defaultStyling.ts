import type { PdfStyleObject } from "@engenty/pdf-service";

export const defaultInvoiceStylingTemplate = `{
  "page": {
    "padding": "48pt",
    "fontSize": "10pt",
    "fontFamily": "Helvetica",
    "color": "{{ theme.textColor }}"
  },
  "header": {
    "marginBottom": "16pt"
  },
  "title": {
    "fontSize": "18pt",
    "fontWeight": 700,
    "color": "{{ theme.accentColor }}",
    "marginBottom": "8pt"
  },
  "muted": {
    "fontSize": "10pt",
    "color": "{{ theme.mutedColor }}",
    "marginBottom": "4pt"
  },
  "section": {
    "marginBottom": "18pt"
  },
  "sectionTitle": {
    "fontSize": "12pt",
    "fontWeight": 700,
    "marginBottom": "8pt"
  },
  "text": {
    "lineHeight": 1.4
  },
  "totals": {
    "marginTop": "6pt"
  },
  "line": {
    "marginBottom": "4pt"
  },
  "total": {
    "marginTop": "8pt",
    "fontSize": "12pt",
    "fontWeight": 700
  }
}`;

export const defaultInvoiceStyleOverrides: PdfStyleObject = {
  page: {
    backgroundColor: "#FFFFFF",
  },
};
