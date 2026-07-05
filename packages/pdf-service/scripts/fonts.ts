#!/usr/bin/env node
/**
 * Fonts CLI - list, install, remove Google Fonts and Fontshare fonts for PDF generation.
 *
 * Usage:
 *   pnpm run fonts list              - List locally installed fonts
 *   pnpm run fonts list --available  - List fonts available to install
 *   pnpm run fonts install <name>    - Install a font (Google Fonts via GitHub)
 *   pnpm run fonts remove <name>     - Remove a font
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ALL_INSTALLABLE,
  findInstallable,
  inferWeightFromFilename,
} from "./font-registry.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(__dirname, "..");
const ASSETS_FONTS = path.join(PKG_ROOT, "assets", "fonts");
const GOOGLE_FONTS_DIR = path.join(ASSETS_FONTS, "google-fonts");
const FONTSHARE_DIR = path.join(ASSETS_FONTS, "fontshare");
const GITHUB_RAW = "https://raw.githubusercontent.com/google/fonts/main/ofl";

const BUILTIN = new Set(["Helvetica", "Times-Roman", "Courier"]);

function getInstalledFonts(): string[] {
  const fromLocalFonts = parseLocalFonts();
  const fromAssets: string[] = [];
  if (fs.existsSync(GOOGLE_FONTS_DIR)) {
    for (const name of fs.readdirSync(GOOGLE_FONTS_DIR)) {
      if (fs.statSync(path.join(GOOGLE_FONTS_DIR, name)).isDirectory()) {
        fromAssets.push(googleFolderToDisplayName(name));
      }
    }
  }
  if (fs.existsSync(FONTSHARE_DIR)) {
    for (const name of fs.readdirSync(FONTSHARE_DIR)) {
      if (fs.statSync(path.join(FONTSHARE_DIR, name)).isDirectory()) {
        const display = name
          .replace(/_Complete$/, "")
          .replace(/([A-Z])/g, " $1")
          .trim();
        if (!fromAssets.includes(display)) {
          fromAssets.push(display);
        }
      }
    }
  }
  const merged = new Set([...fromLocalFonts, ...fromAssets]);
  return [...merged].filter((n) => !BUILTIN.has(n)).sort();
}

function googleFolderToDisplayName(folder: string): string {
  const known: Record<string, string> = {
    Inter: "Inter",
    Roboto: "Roboto",
    Open_Sans: "Open Sans",
    Montserrat: "Montserrat",
    Lato: "Lato",
    playfairdisplay: "Playfair Display",
    raleway: "Raleway",
    nunito: "Nunito",
    sourcesans3: "Source Sans 3",
    oswald: "Oswald",
    worksans: "Work Sans",
    poppins: "Poppins",
    ubuntu: "Ubuntu",
    ptsans: "PT Sans",
  };
  const key = folder.replace(/\s/g, "");
  return known[key] ?? folder;
}

function parseLocalFonts(): string[] {
  const localPath = path.join(PKG_ROOT, "src", "engine", "localFonts.ts");
  if (!fs.existsSync(localPath)) {
    return [];
  }
  const content = fs.readFileSync(localPath, "utf-8");
  const names: string[] = [];
  const re = /^\s{2}(\S(?:[^:\n]|"[^"]*")+?):\s*\{/gm;
  for (let m = re.exec(content); m !== null; m = re.exec(content)) {
    let name = m[1]!.trim();
    if (name.startsWith('"') && name.endsWith('"')) {
      name = name.slice(1, -1);
    }
    if (!BUILTIN.has(name)) {
      names.push(name);
    }
  }
  return names;
}

async function listCmd(args: string[]): void {
  const available = args.includes("--available") || args.includes("-a");
  if (available) {
    console.log("Available to install:\n");
    console.log("Google Fonts:");
    for (const f of ALL_INSTALLABLE.filter((x) => x.source === "google")) {
      console.log(`  - ${f.name}`);
    }
    console.log("\nFontshare (manual download from fontshare.com):");
    for (const f of ALL_INSTALLABLE.filter((x) => x.source === "fontshare")) {
      console.log(`  - ${f.name}`);
    }
    return;
  }
  const installed = getInstalledFonts();
  console.log("Installed fonts:\n");
  for (const name of installed) {
    console.log(`  - ${name}`);
  }
}

async function installCmd(name: string): Promise<void> {
  const font = findInstallable(name);
  if (!font) {
    console.error(`Unknown font: ${name}`);
    console.error("Run 'pnpm run fonts list --available' to see options.");
    process.exit(1);
  }
  if (font.source === "fontshare") {
    console.error(
      "Fontshare fonts require manual download from https://www.fontshare.com/\n" +
        `Download ${font.name}, extract OTF files to:\n` +
        `  ${path.join(FONTSHARE_DIR, font.fontshareFolder ?? font.name, "Fonts", "OTF")}\n` +
        `Then run 'pnpm run fonts list' to verify.`
    );
    process.exit(1);
  }
  const folder = font.googleFolder;
  if (!folder) {
    console.error("No googleFolder for font");
    process.exit(1);
  }
  console.log(`Installing ${font.name} from Google Fonts (GitHub)...`);
  const dir = path.join(GOOGLE_FONTS_DIR, font.name.replace(/\s/g, "_"));
  fs.mkdirSync(dir, { recursive: true });
  const entries = await fetchGoogleFontFiles(folder);
  if (entries.length === 0) {
    console.error(
      `No static TTF/OTF files found for ${font.name}. ` +
        "Variable fonts are not supported by @react-pdf/renderer."
    );
    fs.rmSync(dir, { recursive: true, force: true });
    process.exit(1);
  }
  for (const ent of entries) {
    const filePath = ent.subdir ? `${ent.subdir}/${ent.file}` : ent.file;
    const url = `${GITHUB_RAW}/${folder}/${filePath.split("/").map(encodeURIComponent).join("/")}`;
    const dest = path.join(dir, filePath);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const buf = await fetch(url).then((r) => {
      if (!r.ok) {
        throw new Error(`HTTP ${r.status}: ${url}`);
      }
      return r.arrayBuffer();
    });
    fs.writeFileSync(dest, Buffer.from(buf));
    console.log(`  + ${filePath}`);
  }
  const fileNames = entries.map((e) => e.file);
  await updateLocalFonts(font.name, dir, entries);
  await updateDefaults(font.name, true);
  await updateFontWeights(font.name, fileNames);
  console.log(
    `\nInstalled ${font.name}. Rebuild: pnpm --filter @engenty/pdf-service build`
  );
}

async function fetchGoogleFontFiles(
  folder: string,
  subdir = ""
): Promise<{ file: string; subdir: string }[]> {
  const pathPart = subdir ? `${folder}/${subdir}` : folder;
  const url = `https://api.github.com/repos/google/fonts/contents/ofl/${pathPart}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${url}`);
  }
  const json = (await res.json()) as { name: string; type: string }[];
  const out: { file: string; subdir: string }[] = [];
  for (const e of json) {
    if (e.type === "dir" && (e.name === "static" || e.name === "variable")) {
      const nested = await fetchGoogleFontFiles(
        folder,
        subdir ? `${subdir}/${e.name}` : e.name
      );
      out.push(...nested);
    } else if (
      (e.name.endsWith(".ttf") || e.name.endsWith(".otf")) &&
      !e.name.includes("[") &&
      !e.name.includes("Italic")
    ) {
      out.push({ file: e.name, subdir });
    }
  }
  return out;
}

function buildFontDefinition(
  dir: string,
  entries: { file: string; subdir: string }[]
): string {
  const weightToEntry: [number, { file: string; subdir: string }][] = [];
  for (const e of entries) {
    const w = inferWeightFromFilename(e.file);
    if (w) {
      weightToEntry.push([w, e]);
    }
  }
  weightToEntry.sort((a, b) => a[0] - b[0]);
  const wKeys = [
    "w100",
    "w200",
    "w300",
    "w400",
    "w500",
    "w600",
    "w700",
    "w800",
    "w900",
  ];
  const lines = weightToEntry
    .map(([w, e]) => {
      const key = wKeys[w / 100 - 1];
      const filePath = e.subdir ? path.join(e.subdir, e.file) : e.file;
      const rel = path.relative(ASSETS_FONTS, path.join(dir, filePath));
      const segments = rel.split(path.sep).map((s) => `"${s}"`);
      return key ? `    ${key}: fontPath(${segments.join(", ")}),` : null;
    })
    .filter(Boolean);
  return lines.join("\n");
}

async function updateLocalFonts(
  fontName: string,
  dir: string,
  entries: { file: string; subdir: string }[]
): Promise<void> {
  const def = buildFontDefinition(dir, entries);
  const block = `\n  "${fontName}": {\n${def}\n  },`;
  const localPath = path.join(PKG_ROOT, "src", "engine", "localFonts.ts");
  let content = fs.readFileSync(localPath, "utf-8");
  const insertBefore =
    "  // ============================================================================\n  // Fontshare";
  if (
    content.includes(`"${fontName}":`) ||
    content.includes(`\n  ${fontName}:`)
  ) {
    return;
  }
  content = content.replace(
    insertBefore,
    block +
      "\n\n  // ============================================================================\n  // Fontshare"
  );
  fs.writeFileSync(localPath, content);
}

async function updateDefaults(fontName: string, add: boolean): Promise<void> {
  const defaultsPath = path.join(
    PKG_ROOT,
    "..",
    "pdf-templates",
    "src",
    "defaults.ts"
  );
  if (!fs.existsSync(defaultsPath)) {
    return;
  }
  let content = fs.readFileSync(defaultsPath, "utf-8");
  const inList = content.includes(`"${fontName}"`);
  if (add && !inList) {
    const googleSection = /(\/\/ Google Fonts\n(?: {2}"[^"]+",\n)+)/;
    const m = content.match(googleSection);
    if (m) {
      content = content.replace(m[1]!, `${m[1]!}  "${fontName}",\n`);
    } else {
      content = content.replace(
        /("Lato",)\n( {2}\/\/ Fontshare)/,
        `$1\n  "${fontName}",\n$2`
      );
    }
  } else if (!add && inList) {
    content = content.replace(new RegExp(`  "${fontName}",?\n?`, "g"), "");
  }
  fs.writeFileSync(defaultsPath, content);
}

async function updateFontWeights(
  fontName: string,
  files: string[]
): Promise<void> {
  const weights = files
    .map((f) => inferWeightFromFilename(f))
    .filter((w): w is number => w != null)
    .sort((a, b) => a - b);
  const uniq = [...new Set(weights)];
  const weightsPath = path.join(
    PKG_ROOT,
    "..",
    "pdf-templates",
    "src",
    "font-weights.ts"
  );
  if (!fs.existsSync(weightsPath)) {
    return;
  }
  let content = fs.readFileSync(weightsPath, "utf-8");
  const entry = `  "${fontName}": [${uniq.join(", ")}],`;
  if (content.includes(`"${fontName}":`)) {
    content = content.replace(
      new RegExp(`  "${fontName}": \\[[^\\]]+\\],?\n?`, "g"),
      ""
    );
  }
  content = content.replace(
    /( {2}Lato: \[[^\]]+\],)\n(\n {2}\/\/ Fontshare)/,
    `$1\n  ${entry}\n$2`
  );
  fs.writeFileSync(weightsPath, content);
}

async function removeCmd(name: string): Promise<void> {
  const installed = getInstalledFonts();
  const match = installed.find((n) => n.toLowerCase() === name.toLowerCase());
  if (!match) {
    console.error(`Font not installed: ${name}`);
    process.exit(1);
  }
  if (BUILTIN.has(match)) {
    console.error(`Cannot remove built-in font: ${match}`);
    process.exit(1);
  }
  const fromLocal = parseLocalFonts();
  if (!fromLocal.includes(match)) {
    console.error(`Font not in localFonts: ${match}`);
    process.exit(1);
  }
  const gDir = path.join(GOOGLE_FONTS_DIR, match.replace(/\s/g, "_"));
  const fsFont = ALL_INSTALLABLE.find((f) => f.name === match);
  const fDir = fsFont?.fontshareFolder
    ? path.join(FONTSHARE_DIR, fsFont.fontshareFolder)
    : null;
  if (fs.existsSync(gDir)) {
    fs.rmSync(gDir, { recursive: true });
    console.log(`Removed ${gDir}`);
  }
  if (fDir && fs.existsSync(fDir)) {
    fs.rmSync(fDir, { recursive: true });
    console.log(`Removed ${fDir}`);
  }
  await removeFromLocalFonts(match);
  await updateDefaults(match, false);
  await removeFromFontWeights(match);
  console.log(`Removed ${match}`);
}

function removeFromLocalFonts(fontName: string): void {
  const localPath = path.join(PKG_ROOT, "src", "engine", "localFonts.ts");
  let content = fs.readFileSync(localPath, "utf-8");
  const escaped = fontName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const blockRe = new RegExp(
    `\\n  ("${escaped}"|${escaped}): \\{[\\s\\S]*?\\n  \\},?`,
    "g"
  );
  content = content.replace(blockRe, "");
  fs.writeFileSync(localPath, content);
}

function removeFromFontWeights(fontName: string): void {
  const weightsPath = path.join(
    PKG_ROOT,
    "..",
    "pdf-templates",
    "src",
    "font-weights.ts"
  );
  if (!fs.existsSync(weightsPath)) {
    return;
  }
  let content = fs.readFileSync(weightsPath, "utf-8");
  content = content.replace(
    new RegExp(`  "${fontName}": \\[[^\\]]+\\],?\n?`, "g"),
    ""
  );
  fs.writeFileSync(weightsPath, content);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const cmd = args[0];
  if (!cmd || cmd === "list") {
    await listCmd(args.slice(1));
    return;
  }
  if (cmd === "install") {
    const name = args[1];
    if (!name) {
      console.error("Usage: pnpm run fonts install <name>");
      process.exit(1);
    }
    await installCmd(name);
    return;
  }
  if (cmd === "remove") {
    const name = args[1];
    if (!name) {
      console.error("Usage: pnpm run fonts remove <name>");
      process.exit(1);
    }
    await removeCmd(name);
    return;
  }
  console.error(`Unknown command: ${cmd}`);
  console.error("Usage: pnpm run fonts [list|install|remove] [options]");
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
