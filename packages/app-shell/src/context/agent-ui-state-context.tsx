"use client";

import {
  type AgentUiRouteSnapshot,
  type AgentUiSelectionSnapshot,
  type AgentUiShellSnapshot,
  type AgentUiStateSnapshotV1,
  agentUiBaseShellSignature,
  assertAgentUiStateSnapshotWithinLimit,
  type EngentyFrontendToolMetadata,
  type FrontendToolCallRequest,
  type FrontendToolDefinition,
  type JsonValue,
} from "@engenty/ag-ui-bridge";
import {
  createContext,
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export type AgentUiStateSlice = Partial<
  Pick<
    AgentUiStateSnapshotV1,
    "app_context" | "draft" | "page" | "selection" | "shared"
  >
>;

export interface AgentUiBaseSnapshotInput {
  route: AgentUiRouteSnapshot;
  selection?: AgentUiSelectionSnapshot;
  shell: AgentUiShellSnapshot;
}

export type AgentUiFrontendToolHandler = (
  input: JsonValue,
  request: FrontendToolCallRequest
) => JsonValue | Promise<JsonValue>;
export type AgentUiDialogOpener = (
  payload?: Record<string, JsonValue>
) => void | Promise<void>;
export type AgentUiFieldFocusHandler = () => void;

interface RegisteredFrontendTool {
  definition: FrontendToolDefinition;
  handler: AgentUiFrontendToolHandler;
}

interface AgentUiStateContextValue {
  focusRegisteredField: (fieldId: string) => boolean;
  frontendToolDefinitions: FrontendToolDefinition[];
  getFrontendToolHandler: (name: string) => AgentUiFrontendToolHandler | null;
  openRegisteredDialog: (
    dialogId: string,
    payload?: Record<string, JsonValue>
  ) => Promise<boolean>;
  registerDialog: (id: string, opener: AgentUiDialogOpener) => () => void;
  registerField: (id: string, focus: AgentUiFieldFocusHandler) => () => void;
  registerFrontendTool: (
    definition: FrontendToolDefinition,
    handler: AgentUiFrontendToolHandler
  ) => () => void;
  registerSlice: (id: string, slice: AgentUiStateSlice | null) => () => void;
  snapshot: AgentUiStateSnapshotV1;
}

const AgentUiStateContext = createContext<AgentUiStateContextValue | null>(
  null
);

function createSnapshotId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `agent-ui-${Date.now()}`;
}

function mergeSlices(
  slices: Map<string, AgentUiStateSlice>
): AgentUiStateSlice {
  const merged: AgentUiStateSlice = {};
  for (const slice of slices.values()) {
    if (!slice) {
      continue;
    }
    if (slice.app_context) {
      merged.app_context = [
        ...(merged.app_context ?? []),
        ...slice.app_context,
      ];
    }
    if (slice.page) {
      merged.page = { ...(merged.page ?? {}), ...slice.page };
    }
    if (slice.shared) {
      merged.shared = { ...(merged.shared ?? {}), ...slice.shared };
    }
    if (slice.selection) {
      merged.selection = { ...(merged.selection ?? {}), ...slice.selection };
    }
    if (slice.draft) {
      merged.draft = {
        ...(merged.draft ?? { dirty: false }),
        ...slice.draft,
        fields: {
          ...(merged.draft?.fields ?? {}),
          ...(slice.draft.fields ?? {}),
        },
      };
    }
  }
  return merged;
}

function getFrontendToolMetadata(
  tool: FrontendToolDefinition
): EngentyFrontendToolMetadata {
  return tool.metadata.engenty;
}

export function AgentUiStateProvider({
  base,
  children,
}: {
  base: AgentUiBaseSnapshotInput;
  children: ReactNode;
}) {
  const snapshotIdRef = useRef<string>(createSnapshotId());
  const sequenceRef = useRef(0);
  const slicesRef = useRef(new Map<string, AgentUiStateSlice>());
  const sliceSerialsRef = useRef(new Map<string, string>());
  const toolsRef = useRef(new Map<string, RegisteredFrontendTool>());
  const dialogOpenersRef = useRef(new Map<string, AgentUiDialogOpener>());
  const fieldFocusHandlersRef = useRef(
    new Map<string, AgentUiFieldFocusHandler>()
  );
  const [revision, setRevision] = useState(0);

  const bumpRevision = useCallback(() => {
    sequenceRef.current += 1;
    setRevision((value) => value + 1);
  }, []);

  const baseShellSignature = agentUiBaseShellSignature(base);
  const prevBaseShellSignatureRef = useRef(baseShellSignature);
  useLayoutEffect(() => {
    if (prevBaseShellSignatureRef.current === baseShellSignature) {
      return;
    }
    prevBaseShellSignatureRef.current = baseShellSignature;
    bumpRevision();
  }, [baseShellSignature, bumpRevision]);

  const registerSlice = useCallback(
    (id: string, slice: AgentUiStateSlice | null) => {
      if (slice == null) {
        if (slicesRef.current.delete(id)) {
          sliceSerialsRef.current.delete(id);
          bumpRevision();
        }
        return () => {};
      }
      const serial = JSON.stringify(slice);
      if (sliceSerialsRef.current.get(id) === serial) {
        return () => {};
      }
      slicesRef.current.set(id, slice);
      sliceSerialsRef.current.set(id, serial);
      bumpRevision();
      return () => {
        if (slicesRef.current.delete(id)) {
          sliceSerialsRef.current.delete(id);
          bumpRevision();
        }
      };
    },
    [bumpRevision]
  );

  const registerFrontendTool = useCallback(
    (
      definition: FrontendToolDefinition,
      handler: AgentUiFrontendToolHandler
    ) => {
      toolsRef.current.set(definition.name, { definition, handler });
      bumpRevision();
      return () => {
        if (toolsRef.current.delete(definition.name)) {
          bumpRevision();
        }
      };
    },
    [bumpRevision]
  );

  const registerDialog = useCallback(
    (id: string, opener: AgentUiDialogOpener) => {
      dialogOpenersRef.current.set(id, opener);
      bumpRevision();
      return () => {
        if (dialogOpenersRef.current.delete(id)) {
          bumpRevision();
        }
      };
    },
    [bumpRevision]
  );

  const registerField = useCallback(
    (id: string, focus: AgentUiFieldFocusHandler) => {
      fieldFocusHandlersRef.current.set(id, focus);
      bumpRevision();
      return () => {
        if (fieldFocusHandlersRef.current.delete(id)) {
          bumpRevision();
        }
      };
    },
    [bumpRevision]
  );

  const frontendToolDefinitions = useMemo(
    () => Array.from(toolsRef.current.values(), (entry) => entry.definition),
    // `revision` is the observable clock for ref-backed registries.
    [revision]
  );

  const snapshot = useMemo(() => {
    const slices = mergeSlices(slicesRef.current);
    const next: AgentUiStateSnapshotV1 = {
      ...slices,
      observed_at: new Date().toISOString(),
      permissions: {
        frontend_tools: Object.fromEntries(
          frontendToolDefinitions.map((tool) => {
            const metadata = getFrontendToolMetadata(tool);
            return [
              tool.name,
              {
                available: metadata.availability === "enabled",
              },
            ];
          })
        ),
      },
      route: base.route,
      selection: slices.selection ?? base.selection,
      sequence: sequenceRef.current,
      shell: base.shell,
      snapshot_id: snapshotIdRef.current,
      version: 1,
    };
    assertAgentUiStateSnapshotWithinLimit(next);
    return next;
  }, [base, frontendToolDefinitions, revision]);

  const getFrontendToolHandler = useCallback(
    (name: string) => toolsRef.current.get(name)?.handler ?? null,
    []
  );
  const openRegisteredDialog = useCallback(
    async (dialogId: string, payload?: Record<string, JsonValue>) => {
      const opener = dialogOpenersRef.current.get(dialogId);
      if (!opener) {
        return false;
      }
      await opener(payload);
      return true;
    },
    []
  );
  const focusRegisteredField = useCallback((fieldId: string) => {
    const focus = fieldFocusHandlersRef.current.get(fieldId);
    if (!focus) {
      return false;
    }
    focus();
    return true;
  }, []);

  const value = useMemo<AgentUiStateContextValue>(
    () => ({
      focusRegisteredField,
      frontendToolDefinitions,
      getFrontendToolHandler,
      openRegisteredDialog,
      registerDialog,
      registerField,
      registerFrontendTool,
      registerSlice,
      snapshot,
    }),
    [
      focusRegisteredField,
      frontendToolDefinitions,
      getFrontendToolHandler,
      openRegisteredDialog,
      registerDialog,
      registerField,
      registerFrontendTool,
      registerSlice,
      snapshot,
    ]
  );

  return (
    <AgentUiStateContext.Provider value={value}>
      {children}
    </AgentUiStateContext.Provider>
  );
}

export function useAgentUiStateSnapshot(): AgentUiStateSnapshotV1 {
  const ctx = useContext(AgentUiStateContext);
  if (!ctx) {
    throw new Error(
      "useAgentUiStateSnapshot must be used within AgentUiStateProvider"
    );
  }
  return ctx.snapshot;
}

export function useAgentUiFrontendTools(): FrontendToolDefinition[] {
  const ctx = useContext(AgentUiStateContext);
  if (!ctx) {
    throw new Error(
      "useAgentUiFrontendTools must be used within AgentUiStateProvider"
    );
  }
  return ctx.frontendToolDefinitions;
}

export function useAgentUiFrontendToolHandler(
  name: string
): AgentUiFrontendToolHandler | null {
  const ctx = useContext(AgentUiStateContext);
  if (!ctx) {
    throw new Error(
      "useAgentUiFrontendToolHandler must be used within AgentUiStateProvider"
    );
  }
  return ctx.getFrontendToolHandler(name);
}

export function useAgentUiFrontendToolExecutor(): (
  request: FrontendToolCallRequest
) => Promise<JsonValue> {
  const ctx = useContext(AgentUiStateContext);
  if (!ctx) {
    throw new Error(
      "useAgentUiFrontendToolExecutor must be used within AgentUiStateProvider"
    );
  }
  const { getFrontendToolHandler } = ctx;
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
  const ctx = useContext(AgentUiStateContext);
  if (!ctx) {
    throw new Error(
      "useAgentUiDialogOpener must be used within AgentUiStateProvider"
    );
  }
  return ctx.openRegisteredDialog;
}

export function useAgentUiFieldFocuser(): (fieldId: string) => boolean {
  const ctx = useContext(AgentUiStateContext);
  if (!ctx) {
    throw new Error(
      "useAgentUiFieldFocuser must be used within AgentUiStateProvider"
    );
  }
  return ctx.focusRegisteredField;
}

export function useRegisterAgentUiSlice(
  id: string,
  slice: AgentUiStateSlice | null
): void {
  const ctx = useContext(AgentUiStateContext);
  if (!ctx) {
    throw new Error(
      "useRegisterAgentUiSlice must be used within AgentUiStateProvider"
    );
  }
  const { registerSlice } = ctx;
  const sliceRef = useRef(slice);
  sliceRef.current = slice;
  // `slice` is often a freshly allocated object each render (e.g. useMemo that
  // wraps `form.watch()`). Depending on referential identity re-runs the effect
  // cleanup on every frame, un-registering the slice and bumping provider
  // revision — which re-renders consumers and can exceed React's update depth.
  const sliceKey = JSON.stringify(slice);
  useEffect(
    () => registerSlice(id, sliceRef.current),
    [registerSlice, id, sliceKey]
  );
}

export function useFrontendTool(
  definition: FrontendToolDefinition,
  handler: AgentUiFrontendToolHandler
): void {
  const ctx = useContext(AgentUiStateContext);
  if (!ctx) {
    throw new Error("useFrontendTool must be used within AgentUiStateProvider");
  }
  const { registerFrontendTool } = ctx;
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  useEffect(
    () =>
      registerFrontendTool(definition, (input, request) =>
        handlerRef.current(input, request)
      ),
    [registerFrontendTool, definition]
  );
}

export function useRegisterAgentUiDialog(
  id: string,
  opener: AgentUiDialogOpener
): void {
  const ctx = useContext(AgentUiStateContext);
  if (!ctx) {
    throw new Error(
      "useRegisterAgentUiDialog must be used within AgentUiStateProvider"
    );
  }
  const { registerDialog } = ctx;
  useEffect(() => registerDialog(id, opener), [registerDialog, id, opener]);
}

export function useRegisterAgentUiField(
  id: string,
  refOrFocus: RefObject<HTMLElement | null> | AgentUiFieldFocusHandler
): void {
  const ctx = useContext(AgentUiStateContext);
  if (!ctx) {
    throw new Error(
      "useRegisterAgentUiField must be used within AgentUiStateProvider"
    );
  }
  const { registerField } = ctx;
  useEffect(() => {
    const focus =
      typeof refOrFocus === "function"
        ? refOrFocus
        : () => refOrFocus.current?.focus();
    return registerField(id, focus);
  }, [registerField, id, refOrFocus]);
}
