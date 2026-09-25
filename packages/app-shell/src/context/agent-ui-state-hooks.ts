"use client";

import type {
  AgentUiStateSnapshotV1,
  FrontendToolCallRequest,
  FrontendToolDefinition,
  JsonValue,
} from "@engenty/ag-ui-bridge";
import {
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useRef,
} from "react";
import {
  AgentUiActionsContext,
  type AgentUiDialogOpener,
  type AgentUiFieldFocusHandler,
  type AgentUiFrontendToolHandler,
  AgentUiSnapshotContext,
  type AgentUiStateSlice,
  AgentUiToolsContext,
} from "./agent-ui-state-slices";

function useRequiredAgentUiActions(hook: string) {
  const ctx = useContext(AgentUiActionsContext);
  if (!ctx) {
    throw new Error(`${hook} must be used within AgentUiStateProvider`);
  }
  return ctx;
}

function useRequiredAgentUiSnapshot(hook: string) {
  const ctx = useContext(AgentUiSnapshotContext);
  if (!ctx) {
    throw new Error(`${hook} must be used within AgentUiStateProvider`);
  }
  return ctx;
}

export function useAgentUiStateSnapshot(): AgentUiStateSnapshotV1 {
  return useRequiredAgentUiSnapshot("useAgentUiStateSnapshot").snapshot;
}

/** Stable getter — does not re-render when the snapshot object changes. */
export function useAgentUiStateSnapshotGetter(): () => AgentUiStateSnapshotV1 {
  return useRequiredAgentUiActions("useAgentUiStateSnapshotGetter").getSnapshot;
}

export function useAgentUiFrontendTools(): FrontendToolDefinition[] {
  const tools = useContext(AgentUiToolsContext);
  if (!tools) {
    throw new Error(
      "useAgentUiFrontendTools must be used within AgentUiStateProvider"
    );
  }
  return tools;
}

export function useAgentUiFrontendToolHandler(
  name: string
): AgentUiFrontendToolHandler | null {
  return useRequiredAgentUiActions(
    "useAgentUiFrontendToolHandler"
  ).getFrontendToolHandler(name);
}

export function useAgentUiFrontendToolExecutor(): (
  request: FrontendToolCallRequest
) => Promise<JsonValue> {
  const { getFrontendToolHandler } = useRequiredAgentUiActions(
    "useAgentUiFrontendToolExecutor"
  );
  return useCallback(
    async (request: FrontendToolCallRequest) => {
      const handler = getFrontendToolHandler(request.tool_name);
      if (!handler) {
        throw new Error(
          `Frontend tool is not registered: ${request.tool_name}`
        );
      }
      return handler(request.input, request);
    },
    [getFrontendToolHandler]
  );
}

export function useAgentUiDialogOpener(): (
  dialogId: string,
  payload?: Record<string, JsonValue>
) => Promise<boolean> {
  return useRequiredAgentUiActions("useAgentUiDialogOpener")
    .openRegisteredDialog;
}

export function useAgentUiFieldFocuser(): (fieldId: string) => boolean {
  return useRequiredAgentUiActions("useAgentUiFieldFocuser")
    .focusRegisteredField;
}

export function useAgentUiFieldElement(): (
  fieldId: string
) => HTMLElement | null {
  return useRequiredAgentUiActions("useAgentUiFieldElement")
    .getRegisteredFieldElement;
}

export function useRegisterAgentUiSlice(
  id: string,
  slice: AgentUiStateSlice | null
): void {
  const { registerSlice } = useRequiredAgentUiActions(
    "useRegisterAgentUiSlice"
  );
  const sliceRef = useRef(slice);
  sliceRef.current = slice;
  const sliceKey = JSON.stringify(slice);
  useEffect(
    () => registerSlice(id, sliceRef.current),
    [registerSlice, id, sliceKey]
  );
}

export function useFrontendTool(
  definition: FrontendToolDefinition,
  handler: AgentUiFrontendToolHandler,
  options?: {
    enabled?: boolean;
  }
): void {
  const { registerFrontendTool } = useRequiredAgentUiActions("useFrontendTool");
  const enabled = options?.enabled !== false;
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  useEffect(() => {
    if (!enabled) {
      return;
    }
    return registerFrontendTool(definition, (input, request) =>
      handlerRef.current(input, request)
    );
  }, [enabled, registerFrontendTool, definition]);
}

export function useRegisterAgentUiDialog(
  id: string,
  opener: AgentUiDialogOpener
): void {
  const { registerDialog } = useRequiredAgentUiActions(
    "useRegisterAgentUiDialog"
  );
  useEffect(() => registerDialog(id, opener), [registerDialog, id, opener]);
}

export function useRegisterAgentUiField(
  id: string,
  refOrFocus: RefObject<HTMLElement | null> | AgentUiFieldFocusHandler
): void {
  const { registerField } = useRequiredAgentUiActions(
    "useRegisterAgentUiField"
  );
  useEffect(() => {
    if (typeof refOrFocus === "function") {
      return registerField(id, refOrFocus);
    }
    return registerField(
      id,
      () => {
        refOrFocus.current?.focus();
      },
      () => refOrFocus.current
    );
  }, [registerField, id, refOrFocus]);
}
