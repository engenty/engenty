/**
 * Local font definitions for PDF generation.
 *
 * IMPORTANT: Fontshare fonts use OTF files instead of TTF from WEB folder.
 * The TTF files in Fontshare's WEB folder have CORRUPTED METADATA where the
 * font family name is literally "false" instead of the actual font name.
 * This breaks font matching in react-pdf (fontWeight: 700 won't find the bold variant).
 * The OTF files in the OTF folder have correct metadata.
 *
 * Static weight files are preferred over variable fonts for @react-pdf/renderer
 * because it cannot interpret variable font axes - each weight needs a separate file.
 *
 * Font files are in packages/pdf-service/assets/fonts/ (same layout as engency).
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Built output is dist/, assets are at package root (packages/pdf-service/assets/fonts)
const assetsDir = path.resolve(__dirname, "..", "assets", "fonts");

function fontPath(...segments: string[]): string {
  return path.join(assetsDir, ...segments);
}

/**
 * Font definition supporting both variable and static weight files.
 * Static weights (w100-w900) are preferred for PDF rendering.
 */
export interface FontDefinition {
  bold?: string; // alias for w700
  /** Legacy support for simple regular/bold pairs */
  regular?: string; // alias for w400
  /** Variable font file - used as fallback when no static weights available */
  variable?: string;
  /** Individual weight files - preferred for PDF rendering */
  w100?: string; // Thin
  w200?: string; // Extra Light
  w300?: string; // Light
  w400?: string; // Regular
  w500?: string; // Medium
  w600?: string; // Semi Bold
  w700?: string; // Bold
  w800?: string; // Extra Bold
  w900?: string; // Black
}

/**
 * Map of font family names to their font file paths/URLs.
 * Static weight files are preferred over variable fonts for @react-pdf/renderer.
 *
 * NOTE: Font paths should be absolute file paths or URLs accessible to the Node.js process.
 * For bundled fonts, use a path resolver that can locate assets at runtime.
 */
export const LOCAL_FONTS: Record<string, FontDefinition> = {
  // ============================================================================
  // Google Fonts - Static weight files (preferred for PDF rendering)
  // ============================================================================

  Inter: {
    w100: fontPath("google-fonts", "Inter", "static", "Inter_18pt-Thin.ttf"),
    w200: fontPath(
      "google-fonts",
      "Inter",
      "static",
      "Inter_18pt-ExtraLight.ttf"
    ),
    w300: fontPath("google-fonts", "Inter", "static", "Inter_18pt-Light.ttf"),
    w400: fontPath("google-fonts", "Inter", "static", "Inter_18pt-Regular.ttf"),
    w500: fontPath("google-fonts", "Inter", "static", "Inter_18pt-Medium.ttf"),
    w600: fontPath(
      "google-fonts",
      "Inter",
      "static",
      "Inter_18pt-SemiBold.ttf"
    ),
    w700: fontPath("google-fonts", "Inter", "static", "Inter_18pt-Bold.ttf"),
    w800: fontPath(
      "google-fonts",
      "Inter",
      "static",
      "Inter_18pt-ExtraBold.ttf"
    ),
    w900: fontPath("google-fonts", "Inter", "static", "Inter_18pt-Black.ttf"),
  },

  Roboto: {
    w100: fontPath("google-fonts", "Roboto", "static", "Roboto-Thin.ttf"),
    w200: fontPath("google-fonts", "Roboto", "static", "Roboto-ExtraLight.ttf"),
    w300: fontPath("google-fonts", "Roboto", "static", "Roboto-Light.ttf"),
    w400: fontPath("google-fonts", "Roboto", "static", "Roboto-Regular.ttf"),
    w500: fontPath("google-fonts", "Roboto", "static", "Roboto-Medium.ttf"),
    w600: fontPath("google-fonts", "Roboto", "static", "Roboto-SemiBold.ttf"),
    w700: fontPath("google-fonts", "Roboto", "static", "Roboto-Bold.ttf"),
    w800: fontPath("google-fonts", "Roboto", "static", "Roboto-ExtraBold.ttf"),
    w900: fontPath("google-fonts", "Roboto", "static", "Roboto-Black.ttf"),
  },

  "Open Sans": {
    w300: fontPath("google-fonts", "Open_Sans", "static", "OpenSans-Light.ttf"),
    w400: fontPath(
      "google-fonts",
      "Open_Sans",
      "static",
      "OpenSans-Regular.ttf"
    ),
    w500: fontPath(
      "google-fonts",
      "Open_Sans",
      "static",
      "OpenSans-Medium.ttf"
    ),
    w600: fontPath(
      "google-fonts",
      "Open_Sans",
      "static",
      "OpenSans-SemiBold.ttf"
    ),
    w700: fontPath("google-fonts", "Open_Sans", "static", "OpenSans-Bold.ttf"),
    w800: fontPath(
      "google-fonts",
      "Open_Sans",
      "static",
      "OpenSans-ExtraBold.ttf"
    ),
  },

  Montserrat: {
    w100: fontPath(
      "google-fonts",
      "Montserrat",
      "static",
      "Montserrat-Thin.ttf"
    ),
    w200: fontPath(
      "google-fonts",
      "Montserrat",
      "static",
      "Montserrat-ExtraLight.ttf"
    ),
    w300: fontPath(
      "google-fonts",
      "Montserrat",
      "static",
      "Montserrat-Light.ttf"
    ),
    w400: fontPath(
      "google-fonts",
      "Montserrat",
      "static",
      "Montserrat-Regular.ttf"
    ),
    w500: fontPath(
      "google-fonts",
      "Montserrat",
      "static",
      "Montserrat-Medium.ttf"
    ),
    w600: fontPath(
      "google-fonts",
      "Montserrat",
      "static",
      "Montserrat-SemiBold.ttf"
    ),
    w700: fontPath(
      "google-fonts",
      "Montserrat",
      "static",
      "Montserrat-Bold.ttf"
    ),
    w800: fontPath(
      "google-fonts",
      "Montserrat",
      "static",
      "Montserrat-ExtraBold.ttf"
    ),
    w900: fontPath(
      "google-fonts",
      "Montserrat",
      "static",
      "Montserrat-Black.ttf"
    ),
  },

  Lato: {
    w100: fontPath("google-fonts", "Lato", "Lato-Thin.ttf"),
    w300: fontPath("google-fonts", "Lato", "Lato-Light.ttf"),
    w400: fontPath("google-fonts", "Lato", "Lato-Regular.ttf"),
    w700: fontPath("google-fonts", "Lato", "Lato-Bold.ttf"),
    w900: fontPath("google-fonts", "Lato", "Lato-Black.ttf"),
  },

  Poppins: {
    w100: fontPath("google-fonts", "Poppins", "Poppins-Thin.ttf"),
    w200: fontPath("google-fonts", "Poppins", "Poppins-ExtraLight.ttf"),
    w300: fontPath("google-fonts", "Poppins", "Poppins-Light.ttf"),
    w400: fontPath("google-fonts", "Poppins", "Poppins-Regular.ttf"),
    w500: fontPath("google-fonts", "Poppins", "Poppins-Medium.ttf"),
    w600: fontPath("google-fonts", "Poppins", "Poppins-SemiBold.ttf"),
    w700: fontPath("google-fonts", "Poppins", "Poppins-Bold.ttf"),
    w800: fontPath("google-fonts", "Poppins", "Poppins-ExtraBold.ttf"),
    w900: fontPath("google-fonts", "Poppins", "Poppins-Black.ttf"),
  },

  "PT Sans": {
    w400: fontPath("google-fonts", "PT_Sans", "PT_Sans-Web-Regular.ttf"),
    w700: fontPath("google-fonts", "PT_Sans", "PT_Sans-Web-Bold.ttf"),
  },

  // ============================================================================
  // Fontshare - Static weight files (real separate files for each weight)
  // ============================================================================
  // IMPORTANT: Use OTF files from the OTF folder, NOT TTF from WEB folder

  Satoshi: {
    w300: fontPath(
      "fontshare",
      "Satoshi_Complete",
      "Fonts",
      "OTF",
      "Satoshi-Light.otf"
    ),
    w400: fontPath(
      "fontshare",
      "Satoshi_Complete",
      "Fonts",
      "OTF",
      "Satoshi-Regular.otf"
    ),
    w500: fontPath(
      "fontshare",
      "Satoshi_Complete",
      "Fonts",
      "OTF",
      "Satoshi-Medium.otf"
    ),
    w700: fontPath(
      "fontshare",
      "Satoshi_Complete",
      "Fonts",
      "OTF",
      "Satoshi-Bold.otf"
    ),
    w900: fontPath(
      "fontshare",
      "Satoshi_Complete",
      "Fonts",
      "OTF",
      "Satoshi-Black.otf"
    ),
  },

  "General Sans": {
    w200: fontPath(
      "fontshare",
      "GeneralSans_Complete",
      "Fonts",
      "OTF",
      "GeneralSans-Extralight.otf"
    ),
    w300: fontPath(
      "fontshare",
      "GeneralSans_Complete",
      "Fonts",
      "OTF",
      "GeneralSans-Light.otf"
    ),
    w400: fontPath(
      "fontshare",
      "GeneralSans_Complete",
      "Fonts",
      "OTF",
      "GeneralSans-Regular.otf"
    ),
    w500: fontPath(
      "fontshare",
      "GeneralSans_Complete",
      "Fonts",
      "OTF",
      "GeneralSans-Medium.otf"
    ),
    w600: fontPath(
      "fontshare",
      "GeneralSans_Complete",
      "Fonts",
      "OTF",
      "GeneralSans-Semibold.otf"
    ),
    w700: fontPath(
      "fontshare",
      "GeneralSans_Complete",
      "Fonts",
      "OTF",
      "GeneralSans-Bold.otf"
    ),
  },

  "Clash Grotesk": {
    w200: fontPath(
      "fontshare",
      "ClashGrotesk_Complete",
      "Fonts",
      "OTF",
      "ClashGrotesk-Extralight.otf"
    ),
    w300: fontPath(
      "fontshare",
      "ClashGrotesk_Complete",
      "Fonts",
      "OTF",
      "ClashGrotesk-Light.otf"
    ),
    w400: fontPath(
      "fontshare",
      "ClashGrotesk_Complete",
      "Fonts",
      "OTF",
      "ClashGrotesk-Regular.otf"
    ),
    w500: fontPath(
      "fontshare",
      "ClashGrotesk_Complete",
      "Fonts",
      "OTF",
      "ClashGrotesk-Medium.otf"
    ),
    w600: fontPath(
      "fontshare",
      "ClashGrotesk_Complete",
      "Fonts",
      "OTF",
      "ClashGrotesk-Semibold.otf"
    ),
    w700: fontPath(
      "fontshare",
      "ClashGrotesk_Complete",
      "Fonts",
      "OTF",
      "ClashGrotesk-Bold.otf"
    ),
  },

  Switzer: {
    w100: fontPath(
      "fontshare",
      "Switzer_Complete",
      "Fonts",
      "OTF",
      "Switzer-Thin.otf"
    ),
    w200: fontPath(
      "fontshare",
      "Switzer_Complete",
      "Fonts",
      "OTF",
      "Switzer-Extralight.otf"
    ),
    w300: fontPath(
      "fontshare",
      "Switzer_Complete",
      "Fonts",
      "OTF",
      "Switzer-Light.otf"
    ),
    w400: fontPath(
      "fontshare",
      "Switzer_Complete",
      "Fonts",
      "OTF",
      "Switzer-Regular.otf"
    ),
    w500: fontPath(
      "fontshare",
      "Switzer_Complete",
      "Fonts",
      "OTF",
      "Switzer-Medium.otf"
    ),
    w600: fontPath(
      "fontshare",
      "Switzer_Complete",
      "Fonts",
      "OTF",
      "Switzer-Semibold.otf"
    ),
    w700: fontPath(
      "fontshare",
      "Switzer_Complete",
      "Fonts",
      "OTF",
      "Switzer-Bold.otf"
    ),
    w800: fontPath(
      "fontshare",
      "Switzer_Complete",
      "Fonts",
      "OTF",
      "Switzer-Extrabold.otf"
    ),
    w900: fontPath(
      "fontshare",
      "Switzer_Complete",
      "Fonts",
      "OTF",
      "Switzer-Black.otf"
    ),
  },

  Supreme: {
    w100: fontPath(
      "fontshare",
      "Supreme_Complete",
      "Fonts",
      "OTF",
      "Supreme-Thin.otf"
    ),
    w200: fontPath(
      "fontshare",
      "Supreme_Complete",
      "Fonts",
      "OTF",
      "Supreme-Extralight.otf"
    ),
    w300: fontPath(
      "fontshare",
      "Supreme_Complete",
      "Fonts",
      "OTF",
      "Supreme-Light.otf"
    ),
    w400: fontPath(
      "fontshare",
      "Supreme_Complete",
      "Fonts",
      "OTF",
      "Supreme-Regular.otf"
    ),
    w500: fontPath(
      "fontshare",
      "Supreme_Complete",
      "Fonts",
      "OTF",
      "Supreme-Medium.otf"
    ),
    w700: fontPath(
      "fontshare",
      "Supreme_Complete",
      "Fonts",
      "OTF",
      "Supreme-Bold.otf"
    ),
    w800: fontPath(
      "fontshare",
      "Supreme_Complete",
      "Fonts",
      "OTF",
      "Supreme-Extrabold.otf"
    ),
  },

  Author: {
    w200: fontPath(
      "fontshare",
      "Author_Complete",
      "Fonts",
      "OTF",
      "Author-Extralight.otf"
    ),
    w300: fontPath(
      "fontshare",
      "Author_Complete",
      "Fonts",
      "OTF",
      "Author-Light.otf"
    ),
    w400: fontPath(
      "fontshare",
      "Author_Complete",
      "Fonts",
      "OTF",
      "Author-Regular.otf"
    ),
    w500: fontPath(
      "fontshare",
      "Author_Complete",
      "Fonts",
      "OTF",
      "Author-Medium.otf"
    ),
    w600: fontPath(
      "fontshare",
      "Author_Complete",
      "Fonts",
      "OTF",
      "Author-Semibold.otf"
    ),
    w700: fontPath(
      "fontshare",
      "Author_Complete",
      "Fonts",
      "OTF",
      "Author-Bold.otf"
    ),
  },

  Chillax: {
    w200: fontPath(
      "fontshare",
      "Chillax_Complete",
      "Fonts",
      "OTF",
      "Chillax-Extralight.otf"
    ),
    w300: fontPath(
      "fontshare",
      "Chillax_Complete",
      "Fonts",
      "OTF",
      "Chillax-Light.otf"
    ),
    w400: fontPath(
      "fontshare",
      "Chillax_Complete",
      "Fonts",
      "OTF",
      "Chillax-Regular.otf"
    ),
    w500: fontPath(
      "fontshare",
      "Chillax_Complete",
      "Fonts",
      "OTF",
      "Chillax-Medium.otf"
    ),
    w600: fontPath(
      "fontshare",
      "Chillax_Complete",
      "Fonts",
      "OTF",
      "Chillax-Semibold.otf"
    ),
    w700: fontPath(
      "fontshare",
      "Chillax_Complete",
      "Fonts",
      "OTF",
      "Chillax-Bold.otf"
    ),
  },

  Ranade: {
    w100: fontPath(
      "fontshare",
      "Ranade_Complete",
      "Fonts",
      "OTF",
      "Ranade-Thin.otf"
    ),
    w300: fontPath(
      "fontshare",
      "Ranade_Complete",
      "Fonts",
      "OTF",
      "Ranade-Light.otf"
    ),
    w400: fontPath(
      "fontshare",
      "Ranade_Complete",
      "Fonts",
      "OTF",
      "Ranade-Regular.otf"
    ),
    w500: fontPath(
      "fontshare",
      "Ranade_Complete",
      "Fonts",
      "OTF",
      "Ranade-Medium.otf"
    ),
    w700: fontPath(
      "fontshare",
      "Ranade_Complete",
      "Fonts",
      "OTF",
      "Ranade-Bold.otf"
    ),
  },

  Boska: {
    w200: fontPath(
      "fontshare",
      "Boska_Complete",
      "Fonts",
      "OTF",
      "Boska-Extralight.otf"
    ),
    w300: fontPath(
      "fontshare",
      "Boska_Complete",
      "Fonts",
      "OTF",
      "Boska-Light.otf"
    ),
    w400: fontPath(
      "fontshare",
      "Boska_Complete",
      "Fonts",
      "OTF",
      "Boska-Regular.otf"
    ),
    w500: fontPath(
      "fontshare",
      "Boska_Complete",
      "Fonts",
      "OTF",
      "Boska-Medium.otf"
    ),
    w700: fontPath(
      "fontshare",
      "Boska_Complete",
      "Fonts",
      "OTF",
      "Boska-Bold.otf"
    ),
    w900: fontPath(
      "fontshare",
      "Boska_Complete",
      "Fonts",
      "OTF",
      "Boska-Black.otf"
    ),
  },

  "Bespoke Serif": {
    w300: fontPath(
      "fontshare",
      "BespokeSerif_Complete",
      "Fonts",
      "OTF",
      "BespokeSerif-Light.otf"
    ),
    w400: fontPath(
      "fontshare",
      "BespokeSerif_Complete",
      "Fonts",
      "OTF",
      "BespokeSerif-Regular.otf"
    ),
    w500: fontPath(
      "fontshare",
      "BespokeSerif_Complete",
      "Fonts",
      "OTF",
      "BespokeSerif-Medium.otf"
    ),
    w700: fontPath(
      "fontshare",
      "BespokeSerif_Complete",
      "Fonts",
      "OTF",
      "BespokeSerif-Bold.otf"
    ),
    w800: fontPath(
      "fontshare",
      "BespokeSerif_Complete",
      "Fonts",
      "OTF",
      "BespokeSerif-Extrabold.otf"
    ),
  },

  Sentient: {
    w200: fontPath(
      "fontshare",
      "Sentient_Complete",
      "Fonts",
      "OTF",
      "Sentient-Extralight.otf"
    ),
    w300: fontPath(
      "fontshare",
      "Sentient_Complete",
      "Fonts",
      "OTF",
      "Sentient-Light.otf"
    ),
    w400: fontPath(
      "fontshare",
      "Sentient_Complete",
      "Fonts",
      "OTF",
      "Sentient-Regular.otf"
    ),
    w500: fontPath(
      "fontshare",
      "Sentient_Complete",
      "Fonts",
      "OTF",
      "Sentient-Medium.otf"
    ),
    w700: fontPath(
      "fontshare",
      "Sentient_Complete",
      "Fonts",
      "OTF",
      "Sentient-Bold.otf"
    ),
  },

  Telma: {
    w300: fontPath(
      "fontshare",
      "Telma_Complete",
      "Fonts",
      "OTF",
      "Telma-Light.otf"
    ),
    w400: fontPath(
      "fontshare",
      "Telma_Complete",
      "Fonts",
      "OTF",
      "Telma-Regular.otf"
    ),
    w500: fontPath(
      "fontshare",
      "Telma_Complete",
      "Fonts",
      "OTF",
      "Telma-Medium.otf"
    ),
    w700: fontPath(
      "fontshare",
      "Telma_Complete",
      "Fonts",
      "OTF",
      "Telma-Bold.otf"
    ),
    w900: fontPath(
      "fontshare",
      "Telma_Complete",
      "Fonts",
      "OTF",
      "Telma-Black.otf"
    ),
  },

  Zodiak: {
    w100: fontPath(
      "fontshare",
      "Zodiak_Complete",
      "Fonts",
      "OTF",
      "Zodiak-Thin.otf"
    ),
    w300: fontPath(
      "fontshare",
      "Zodiak_Complete",
      "Fonts",
      "OTF",
      "Zodiak-Light.otf"
    ),
    w400: fontPath(
      "fontshare",
      "Zodiak_Complete",
      "Fonts",
      "OTF",
      "Zodiak-Regular.otf"
    ),
    w700: fontPath(
      "fontshare",
      "Zodiak_Complete",
      "Fonts",
      "OTF",
      "Zodiak-Bold.otf"
    ),
    w800: fontPath(
      "fontshare",
      "Zodiak_Complete",
      "Fonts",
      "OTF",
      "Zodiak-Extrabold.otf"
    ),
    w900: fontPath(
      "fontshare",
      "Zodiak_Complete",
      "Fonts",
      "OTF",
      "Zodiak-Black.otf"
    ),
  },

  Stardom: {
    w400: fontPath(
      "fontshare",
      "Stardom_Complete",
      "Fonts",
      "OTF",
      "Stardom-Regular.otf"
    ),
  },
};

/**
 * Get font definition for a family name.
 */
export function getLocalFontUrl(family: string): FontDefinition | undefined {
  return LOCAL_FONTS[family];
}
