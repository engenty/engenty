"use client";

import type {
  AgentUiStateSnapshotV1,
  FrontendToolCallRequest,
  FrontendToolDefinition,
  JsonValue,
} from "@engenty/ag-ui-bridge";
import { createContext } from "react";

export type AgentUiStateSlice = Partial<
  Pick<
    AgentUiStateSnapshotV1,
    "app_context" | "draft" | "page" | "selection" | "shared"
  >
>;

export type AgentUiFrontendToolHandler = (
  input: JsonValue,
  request: FrontendToolCallRequest
) => JsonValue | Promise<JsonValue>;
export type AgentUiDialogOpener = (
  payload?: Record<string, JsonValue>
) => void | Promise<void>;
export type AgentUiFieldFocusHandler = () => void;
export type AgentUiFieldElementGetter = () => HTMLElement | null;

export interface AgentUiActionsValue {
  focusRegisteredField: (fieldId: string) => boolean;
  getFrontendToolHandler: (name: string) => AgentUiFrontendToolHandler | null;
  getRegisteredFieldElement: (fieldId: string) => HTMLElement | null;
  getSnapshot: () => AgentUiStateSnapshotV1;
  openRegisteredDialog: (
    dialogId: string,
    payload?: Record<string, JsonValue>
  ) => Promise<boolean>;
  registerDialog: (id: string, opener: AgentUiDialogOpener) => () => void;
  registerField: (
    id: string,
    focus: AgentUiFieldFocusHandler,
    getElement?: AgentUiFieldElementGetter
  ) => () => void;
  registerFrontendTool: (
    definition: FrontendToolDefinition,
    handler: AgentUiFrontendToolHandler
  ) => () => void;
  registerSlice: (id: string, slice: AgentUiStateSlice | null) => () => void;
}

export interface AgentUiSnapshotValue {
  snapshot: AgentUiStateSnapshotV1;
}

export const AgentUiActionsContext = createContext<AgentUiActionsValue | null>(
  null
);
export const AgentUiSnapshotContext =
  createContext<AgentUiSnapshotValue | null>(null);
export const AgentUiToolsContext = createContext<
  FrontendToolDefinition[] | null
>(null);
