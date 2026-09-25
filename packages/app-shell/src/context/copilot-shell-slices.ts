"use client";

import { createContext } from "react";
import type {
  CopilotRouteContext,
  CopilotShellActionsValue,
  CopilotShellHostValue,
  CopilotShellLayoutValue,
} from "../types/copilot-shell";

export const CopilotLayoutContext =
  createContext<CopilotShellLayoutValue | null>(null);
export const CopilotActionsContext =
  createContext<CopilotShellActionsValue | null>(null);
export const CopilotHostContext = createContext<CopilotShellHostValue | null>(
  null
);
export const CopilotOverrideContext =
  createContext<Partial<CopilotRouteContext> | null>(null);
