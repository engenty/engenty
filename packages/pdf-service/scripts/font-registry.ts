/**
 * Registry of installable fonts from Google Fonts and Fontshare.
 * Maps display names to source metadata for the fonts CLI.
 */

export type FontSource = "google" | "fontshare";

export interface InstallableFont {
  /** Fontshare: folder name (e.g. "Satoshi_Complete") */
  fontshareFolder?: string;
  /** Google Fonts: ofl folder name (e.g. "playfairdisplay") */
  googleFolder?: string;
  /** Display name (e.g. "Playfair Display") */
  name: string;
  source: FontSource;
}

/** Font filename suffix -> CSS weight (100-900). Order matters: longer suffixes first. */
const WEIGHT_SUFFIXES: [string, number][] = [
  ["Extralight", 200],
  ["Extra-Light", 200],
  ["ExtraLight", 200],
  ["Extrabold", 800],
  ["Extra-Bold", 800],
  ["ExtraBold", 800],
  ["Semibold", 600],
  ["Semi-Bold", 600],
  ["SemiBold", 600],
  ["Thin", 100],
  ["Light", 300],
  ["Regular", 400],
  ["Medium", 500],
  ["Bold", 700],
  ["Black", 900],
];

/**
 * Infer weight from font filename (e.g. "Poppins-Bold.ttf" -> 700)
 */
export function inferWeightFromFilename(filename: string): number | null {
  const base = filename.replace(/\.(ttf|otf)$/i, "");
  if (base.includes("Italic")) {
    return null;
  }
  for (const [suffix, weight] of WEIGHT_SUFFIXES) {
    if (base.endsWith(suffix)) {
      return weight;
    }
  }
  return null;
}

/** Google Fonts ofl folder name -> display name */
const GOOGLE_FOLDER_TO_NAME: Record<string, string> = {
  playfairdisplay: "Playfair Display",
  raleway: "Raleway",
  nunito: "Nunito",
  sourcesans3: "Source Sans 3",
  oswald: "Oswald",
  worksans: "Work Sans",
  poppins: "Poppins",
  ubuntu: "Ubuntu",
  ptsans: "PT Sans",
  inter: "Inter",
  roboto: "Roboto",
  opensans: "Open Sans",
  montserrat: "Montserrat",
  lato: "Lato",
};

/** Known installable fonts from Google (ofl folder) */
export const GOOGLE_FONTS: InstallableFont[] = [
  {
    name: "Playfair Display",
    source: "google",
    googleFolder: "playfairdisplay",
  },
  { name: "Raleway", source: "google", googleFolder: "raleway" },
  { name: "Nunito", source: "google", googleFolder: "nunito" },
  { name: "Source Sans 3", source: "google", googleFolder: "sourcesans3" },
  { name: "Oswald", source: "google", googleFolder: "oswald" },
  { name: "Work Sans", source: "google", googleFolder: "worksans" },
  { name: "Poppins", source: "google", googleFolder: "poppins" },
  { name: "Ubuntu", source: "google", googleFolder: "ubuntu" },
  { name: "PT Sans", source: "google", googleFolder: "ptsans" },
  { name: "Inter", source: "google", googleFolder: "inter" },
  { name: "Roboto", source: "google", googleFolder: "roboto" },
  { name: "Open Sans", source: "google", googleFolder: "opensans" },
  { name: "Montserrat", source: "google", googleFolder: "montserrat" },
  { name: "Lato", source: "google", googleFolder: "lato" },
];

/** Fontshare fonts (require manual download; no public API) */
export const FONTSHARE_FONTS: InstallableFont[] = [
  { name: "Satoshi", source: "fontshare", fontshareFolder: "Satoshi_Complete" },
  {
    name: "General Sans",
    source: "fontshare",
    fontshareFolder: "GeneralSans_Complete",
  },
  {
    name: "Clash Grotesk",
    source: "fontshare",
    fontshareFolder: "ClashGrotesk_Complete",
  },
  { name: "Switzer", source: "fontshare", fontshareFolder: "Switzer_Complete" },
  { name: "Supreme", source: "fontshare", fontshareFolder: "Supreme_Complete" },
  { name: "Author", source: "fontshare", fontshareFolder: "Author_Complete" },
  { name: "Chillax", source: "fontshare", fontshareFolder: "Chillax_Complete" },
  { name: "Ranade", source: "fontshare", fontshareFolder: "Ranade_Complete" },
  { name: "Boska", source: "fontshare", fontshareFolder: "Boska_Complete" },
  {
    name: "Bespoke Serif",
    source: "fontshare",
    fontshareFolder: "BespokeSerif_Complete",
  },
  {
    name: "Sentient",
    source: "fontshare",
    fontshareFolder: "Sentient_Complete",
  },
  { name: "Telma", source: "fontshare", fontshareFolder: "Telma_Complete" },
  { name: "Zodiak", source: "fontshare", fontshareFolder: "Zodiak_Complete" },
  { name: "Stardom", source: "fontshare", fontshareFolder: "Stardom_Complete" },
];

export const ALL_INSTALLABLE = [...GOOGLE_FONTS, ...FONTSHARE_FONTS];

export function findInstallable(name: string): InstallableFont | undefined {
  const n = name.trim();
  return ALL_INSTALLABLE.find((f) => f.name.toLowerCase() === n.toLowerCase());
}
