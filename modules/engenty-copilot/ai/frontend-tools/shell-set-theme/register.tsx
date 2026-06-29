import { useEngentyFrontendTool } from "@engenty/ai-ui";
import { SHELL_SET_THEME_SPEC } from "./definition.js";

export type CopilotThemeMode = "light" | "dark" | "system";

export function useRegisterShellSetThemeFrontendTool(options: {
  invalidateWorkspaceContext: () => Promise<unknown>;
  persistAppearance: (key: string, value: unknown) => Promise<unknown>;
  setTheme: (theme: CopilotThemeMode) => void;
}): void {
  useEngentyFrontendTool({
    ...SHELL_SET_THEME_SPEC,
    handler: async ({ theme }) => {
      options.setTheme(theme);
      await options.persistAppearance("appearance.theme_mode", {
        type: "string",
        value_string: theme,
      });
      await options.invalidateWorkspaceContext();
      return { ok: true, theme };
    },
  });
}
