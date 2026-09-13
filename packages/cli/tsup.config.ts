import { defineConfig } from "tsup";

/**
 * Two builds. `index` is what `@engenty/core` imports inside the workspace —
 * workspace deps stay external. `bin` is the published `engenty` command and
 * must run from a bare `npx` install, so every `@engenty/*` import is bundled
 * into it; only `commander` and `@clack/prompts` remain real dependencies.
 */
export default defineConfig([
  {
    entry: ["src/index.ts"],
    format: ["esm"],
  },
  {
    entry: ["src/bin.ts"],
    format: ["esm"],
    noExternal: [/^@engenty\//],
  },
]);
