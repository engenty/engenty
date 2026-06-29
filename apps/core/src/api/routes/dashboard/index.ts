import type { RegisterDashboardParams } from "./shared.js";
import { registerDashboardWidgetsGenerate } from "./widgets-generate.js";
import { registerDashboardWidgetsRuntime } from "./widgets-runtime.js";

export type { RegisterDashboardParams } from "./shared.js";

export function registerDashboardRoutes(params: RegisterDashboardParams): void {
  registerDashboardWidgetsGenerate(params);
  registerDashboardWidgetsRuntime(params);
}
