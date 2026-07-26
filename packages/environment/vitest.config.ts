import { tmpdir } from "node:os";
import path from "node:path";
import { defineConfig } from "vitest/config";

// Node ≥22 exposes web `localStorage` only with `--localstorage-file`. Without
// it the getter is undefined and shadows happy-dom's Storage implementation.
const localStorageFile = path.join(
  tmpdir(),
  "engenty-environment-vitest-localstorage"
);

export default defineConfig({
  test: {
    environment: "happy-dom",
    execArgv: [`--localstorage-file=${localStorageFile}`],
    include: ["src/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
});
