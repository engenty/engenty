import fs from "node:fs";
import path from "node:path";
import { cliPackageRoot } from "../workspace.js";

/**
 * Files the release ships for installs that have no checkout: the compose
 * files and the Supabase config template. `scripts/publish-cli.mjs` stages
 * them under `templates/`; a workspace build run from outside its checkout
 * falls back to the sources they were staged from.
 */
const WORKSPACE_FALLBACKS: Record<string, string> = {
  "config.toml.example": "../../supabase/config.toml.example",
};

export function templatePath(name: string): string | null {
  const staged = path.join(cliPackageRoot(), "templates", name);
  if (fs.existsSync(staged)) {
    return staged;
  }
  const fallback = path.join(
    cliPackageRoot(),
    WORKSPACE_FALLBACKS[name] ?? path.join("../../deploy", name)
  );
  return fs.existsSync(fallback) ? fallback : null;
}

export function requireTemplate(name: string): string {
  const file = templatePath(name);
  if (!file) {
    throw new Error(
      `${name} is missing from this engenty package — reinstall it with \`npx engenty@latest\`.`
    );
  }
  return file;
}
