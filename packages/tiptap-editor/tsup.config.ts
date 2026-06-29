import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "base/index": "src/base/index.tsx",
    "rich/index": "src/rich/index.tsx",
    "inline-editable/index": "src/inline-editable/index.tsx",
  },
  format: ["esm"],
  dts: true,
  clean: true,
  external: ["react", "react-dom"],
  splitting: false,
});
