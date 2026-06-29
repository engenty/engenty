import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function copyCopilotAgentPrompts() {
  const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const src = path.join(root, "ai/agents/engenty.copilot");
  const dest = path.join(root, "dist/ai/agents/engenty.copilot");

  fs.mkdirSync(dest, { recursive: true });
  for (const file of fs.readdirSync(src)) {
    if (/\.(md|json)$/.test(file)) {
      fs.copyFileSync(path.join(src, file), path.join(dest, file));
    }
  }
}
