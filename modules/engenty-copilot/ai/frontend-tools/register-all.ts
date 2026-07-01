import type { CopilotDockMode } from "@engenty/app-shell";
import { useRegisterBrowserUseFrontendTools } from "./browser-use/register.js";
import { useRegisterCloseCopilotFrontendTool } from "./close-copilot/register.js";
import { useRegisterFocusFieldFrontendTool } from "./focus-field/register.js";
import {
  type CopilotLocale,
  useRegisterI18nSetLocaleFrontendTool,
} from "./i18n-set-locale/register.js";
import { useRegisterNavigateFrontendTool } from "./navigate/register.js";
import { useRegisterOfferFileDownloadsFrontendTool } from "./offer-file-downloads/register.js";
import { useRegisterOpenCopilotFrontendTool } from "./open-copilot/register.js";
import { useRegisterOpenDialogFrontendTool } from "./open-dialog/register.js";
import { useRegisterSetCopilotDockModeFrontendTool } from "./set-copilot-dock-mode/register.js";
import {
  type CopilotThemeMode,
  useRegisterShellSetThemeFrontendTool,
} from "./shell-set-theme/register.js";

export interface RegisterCopilotFrontendToolsOptions {
  changeLanguage: (locale: CopilotLocale) => Promise<unknown>;
  invalidateWorkspaceContext: () => Promise<unknown>;
  open: boolean;
  openCopilotShell: () => void;
  persistAppearance: (key: string, value: unknown) => Promise<unknown>;
  setOpen: (open: boolean) => void;
  setPreferredDockMode?: (mode: CopilotDockMode | null) => void;
  setTheme: (theme: CopilotThemeMode) => void;
}

export function useRegisterCopilotFrontendTools(
  options: RegisterCopilotFrontendToolsOptions
): void {
  useRegisterNavigateFrontendTool({
    openCopilotShell: options.openCopilotShell,
  });
  useRegisterOfferFileDownloadsFrontendTool();
  useRegisterOpenCopilotFrontendTool({
    openCopilotShell: options.openCopilotShell,
  });
  useRegisterCloseCopilotFrontendTool({ setOpen: options.setOpen });
  useRegisterSetCopilotDockModeFrontendTool({
    setPreferredDockMode: options.setPreferredDockMode,
  });
  useRegisterOpenDialogFrontendTool();
  useRegisterFocusFieldFrontendTool();
  useRegisterShellSetThemeFrontendTool({
    invalidateWorkspaceContext: options.invalidateWorkspaceContext,
    persistAppearance: options.persistAppearance,
    setTheme: options.setTheme,
  });
  useRegisterI18nSetLocaleFrontendTool({
    changeLanguage: options.changeLanguage,
    invalidateWorkspaceContext: options.invalidateWorkspaceContext,
    persistAppearance: options.persistAppearance,
  });
  useRegisterBrowserUseFrontendTools();
}

// biome-ignore lint/performance/noBarrelFile: Public browser registration entrypoint.
export { useRegisterBrowserUseFrontendTools } from "./browser-use/register.js";
export { useRegisterCloseCopilotFrontendTool } from "./close-copilot/register.js";
export { useRegisterFocusFieldFrontendTool } from "./focus-field/register.js";
export {
  type CopilotLocale,
  useRegisterI18nSetLocaleFrontendTool,
} from "./i18n-set-locale/register.js";
export {
  useNavigateFrontendToolExecutor,
  useRegisterNavigateFrontendTool,
} from "./navigate/register.js";
export {
  type NavigateLike,
  runNavigateFrontendTool,
} from "./navigate/run.js";
export { useRegisterOfferFileDownloadsFrontendTool } from "./offer-file-downloads/register.js";
export {
  type OfferFileDownloadItem,
  runOfferFileDownloadsFrontendTool,
} from "./offer-file-downloads/run.js";
export { useRegisterOpenCopilotFrontendTool } from "./open-copilot/register.js";
export { useRegisterOpenDialogFrontendTool } from "./open-dialog/register.js";
export { useRegisterSetCopilotDockModeFrontendTool } from "./set-copilot-dock-mode/register.js";
export {
  type CopilotThemeMode,
  useRegisterShellSetThemeFrontendTool,
} from "./shell-set-theme/register.js";
