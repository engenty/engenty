import fs from "node:fs";
import path from "node:path";

const distDir = path.resolve("dist");
const srcDir = path.resolve("src");

// 1. Copy md.d.ts to dist/md.d.ts
fs.copyFileSync(path.join(srcDir, "md.d.ts"), path.join(distDir, "md.d.ts"));

// 2. Prepend the reference to dist/index.d.ts
const indexPath = path.join(distDir, "index.d.ts");
if (fs.existsSync(indexPath)) {
  const content = fs.readFileSync(indexPath, "utf8");
  if (!content.startsWith('/// <reference path="./md.d.ts" />')) {
    fs.writeFileSync(
      indexPath,
      `/// <reference path="./md.d.ts" />\n\n${content}`
    );
  }
}
