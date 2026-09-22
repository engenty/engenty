import { defineConfig } from "tsup";
import { copyCopilotAgentPrompts } from "./scripts/copy-copilot-agent-prompts.mjs";

export default defineConfig({
  entry: [
    "ai/index.ts",
    "ai/frontend-tools/index.ts",
    "ai/frontend-tools/register-all.ts",
    "src/plugin.ts",
    "src/lib/copilot-workspace.ts",
    "src/lib/ensure-copilot-user-workspace-prefix.ts",
    "ui/plugin.ts",
    "ui/components/chat/copilot-effort-control.tsx",
    "ui/components/chat/copilot-model-chooser-control.tsx",
  ],
  format: ["esm"],
  clean: true,
  // Planning notes under `dev/` — not part of the build graph; editing them
  // must not rebuild dist (and cascade into apps/ai / Vite).
  ignoreWatch: ["dev"],
  esbuildOptions(options) {
    options.loader = {
      ...options.loader,
      ".md": "text",
    };
    options.plugins ??= [];
    options.plugins.push({
      name: "copy-copilot-agent-prompts",
      setup(build) {
        build.onEnd((result) => {
          if (result.errors.length === 0) {
            copyCopilotAgentPrompts();
          }
        });
      },
    });
  },
  onSuccess: async () => {
    copyCopilotAgentPrompts();
  },
});
