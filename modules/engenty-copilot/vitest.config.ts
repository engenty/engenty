import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    {
      name: "engenty-copilot-md-text",
      load(id) {
        if (id.endsWith(".md")) {
          const body = readFileSync(id, "utf8");
          return {
            code: `export default ${JSON.stringify(body)}`,
          };
        }
      },
    },
  ],
  test: {
    include: ["ai/**/*.test.ts", "src/**/*.test.ts", "ui/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
});
