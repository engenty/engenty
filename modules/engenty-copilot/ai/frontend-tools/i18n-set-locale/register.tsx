import { useEngentyFrontendTool } from "@engenty/ai-ui";
import { SET_LOCALE_SPEC } from "./definition.js";

export type CopilotLocale = "en" | "de";

export function useRegisterI18nSetLocaleFrontendTool(options: {
  changeLanguage: (locale: CopilotLocale) => Promise<unknown>;
  invalidateWorkspaceContext: () => Promise<unknown>;
  persistAppearance: (key: string, value: unknown) => Promise<unknown>;
}): void {
  useEngentyFrontendTool({
    ...SET_LOCALE_SPEC,
    handler: async ({ locale }) => {
      await options.changeLanguage(locale);
      await options.persistAppearance("appearance.language", {
        type: "string",
        value_string: locale,
      });
      await options.invalidateWorkspaceContext();
      return { ok: true, locale };
    },
  });
}
