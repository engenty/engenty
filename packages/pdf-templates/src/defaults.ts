import type { PdfTemplateSettings } from "./types.js";

export const PDF_TEMPLATE_FONT_FAMILIES = [
  // Built-in fonts
  "Helvetica",
  "Times-Roman",
  "Courier",
  // Google Fonts
  "Inter",
  "Roboto",
  "Open Sans",
  "Montserrat",
  "Lato",
  "Poppins",
  "PT Sans",
  // Fontshare fonts
  "Satoshi",
  "General Sans",
  "Clash Grotesk",
  "Switzer",
  "Supreme",
  "Author",
  "Chillax",
  "Ranade",
  "Boska",
  "Bespoke Serif",
  "Sentient",
  "Telma",
  "Zodiak",
  "Stardom",
] as const;

export function createDefaultPdfTemplateSettings(): PdfTemplateSettings {
  return {
    colors: {
      text: "#000000",
      muted: "#666666",
      accent: "#148CE6",
      secondary: "#E9A52F",
      lines: "#CCCCCC",
      danger: "#DC2626",
      backgrounds: {
        accent: "#DFFBFB",
        muted: "#F8F8F8",
        page: "#FFFFFF",
      },
    },
    typography: {
      title: { family: "Helvetica", size: "24pt", weight: 700 },
      headlines: { family: "Helvetica", size: "16pt", weight: 700 },
      text: { family: "Helvetica", size: "11pt", weight: 400 },
      fixed: { family: "Courier", size: "10pt", weight: 400 },
      small: { family: "Helvetica", size: "9pt", weight: 400 },
    },
    base_font_size: 11,
    margins: {
      top: 92,
      right: 30,
      bottom: 138,
      left: 38,
    },
    letterhead: {
      asset_url: null,
      fit: "contain",
      horizontal: "center",
      vertical: "top",
    },
  };
}

export function buildPdfTemplateRenderData(
  settings: PdfTemplateSettings,
  data: Record<string, unknown>
) {
  return {
    ...data,
    settings,
    theme: {
      textColor: settings.colors.text,
      mutedColor: settings.colors.muted,
      accentColor: settings.colors.accent,
      secondaryColor: settings.colors.secondary,
      lineColor: settings.colors.lines,
      dangerColor: settings.colors.danger,
      accentBackground: settings.colors.backgrounds.accent,
      mutedBackground: settings.colors.backgrounds.muted,
      pageBackground: settings.colors.backgrounds.page,
      fonts: settings.typography,
      margins: settings.margins,
      baseFontSize: settings.base_font_size,
      letterhead: settings.letterhead,
    },
  };
}
