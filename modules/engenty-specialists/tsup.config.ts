import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["ai/index.ts", "ai/floor.ts", "src/plugin.ts"],
  format: ["esm"],
  clean: true,
  // Planning notes under `dev/` — not part of the build graph; editing them
  // must not rebuild dist (and cascade into apps/ai).
  ignoreWatch: ["dev"],
  esbuildOptions(options) {
    // SKILL.md and the instruction assets are imported as strings.
    options.loader = {
      ...options.loader,
      ".md": "text",
    };
  },
});
