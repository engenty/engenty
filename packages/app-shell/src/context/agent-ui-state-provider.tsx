"use client";

import {
  type AgentUiRouteSnapshot,
  type AgentUiSelectionSnapshot,
  type AgentUiShellSnapshot,
  type AgentUiStateSnapshotV1,
  agentUiBaseShellSignature,
  assertAgentUiStateSnapshotWithinLimit,
  type FrontendToolDefinition,
  type JsonValue,
} from "@engenty/ag-ui-bridge";
import {
  type ReactNode,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  isPlausibleAgentUiFieldActiveElement,
  queryAgentUiFieldElement,
} from "../lib/agent-ui-field-element.js";
import {
  createSnapshotId,
  getFrontendToolMetadata,
  mergeSlices,
} from "./agent-ui-state-lib";
import {
  AgentUiActionsContext,
  type AgentUiActionsValue,
  type AgentUiDialogOpener,
  type AgentUiFieldElementGetter,
  type AgentUiFieldFocusHandler,
  type AgentUiFrontendToolHandler,
  AgentUiSnapshotContext,
  type AgentUiSnapshotValue,
  type AgentUiStateSlice,
  AgentUiToolsContext,
} from "./agent-ui-state-slices";

export interface AgentUiBaseSnapshotInput {
  route: AgentUiRouteSnapshot;
  selection?: AgentUiSelectionSnapshot;
  shell: AgentUiShellSnapshot;
}

interface RegisteredFrontendTool {
  definition: FrontendToolDefinition;
  handler: AgentUiFrontendToolHandler;
}

interface RegisteredAgentUiField {
  focus: AgentUiFieldFocusHandler;
  getElement?: AgentUiFieldElementGetter;
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
  const fieldsRef = useRef(new Map<string, RegisteredAgentUiField>());
  const [revision, setRevision] = useState(0);
  const [toolsRevision, setToolsRevision] = useState(0);

  const bumpRevision = useCallback(() => {
    sequenceRef.current += 1;
    setRevision((value) => value + 1);
  }, []);

  const bumpToolsRevision = useCallback(() => {
    setToolsRevision((value) => value + 1);
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
      bumpToolsRevision();
      bumpRevision();
      return () => {
        if (toolsRef.current.delete(definition.name)) {
          bumpToolsRevision();
          bumpRevision();
        }
      };
    },
    [bumpRevision, bumpToolsRevision]
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
    (
      id: string,
      focus: AgentUiFieldFocusHandler,
      getElement?: AgentUiFieldElementGetter
    ) => {
      fieldsRef.current.set(id, { focus, getElement });
      bumpRevision();
      return () => {
        if (fieldsRef.current.delete(id)) {
          bumpRevision();
        }
      };
    },
    [bumpRevision]
  );

  const frontendToolDefinitions = useMemo(
    () => Array.from(toolsRef.current.values(), (entry) => entry.definition),
    [toolsRevision]
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

  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const getSnapshot = useCallback(() => snapshotRef.current, []);

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
    const entry = fieldsRef.current.get(fieldId);
    if (!entry) {
      return false;
    }
    entry.focus();
    return true;
  }, []);

  const getRegisteredFieldElement = useCallback((fieldId: string) => {
    const entry = fieldsRef.current.get(fieldId);
    if (!entry) {
      return null;
    }
    const fromGetter = entry.getElement?.() ?? null;
    if (fromGetter?.isConnected) {
      return fromGetter;
    }
    const fromDom = queryAgentUiFieldElement(fieldId);
    if (fromDom) {
      return fromDom;
    }
    entry.focus();
    const active = document.activeElement;
    if (isPlausibleAgentUiFieldActiveElement(fieldId, active)) {
      return active;
    }
    return null;
  }, []);

  const actionsValue = useMemo<AgentUiActionsValue>(
    () => ({
      focusRegisteredField,
      getFrontendToolHandler,
      getRegisteredFieldElement,
      getSnapshot,
      openRegisteredDialog,
      registerDialog,
      registerField,
      registerFrontendTool,
      registerSlice,
    }),
    [
      focusRegisteredField,
      getFrontendToolHandler,
      getRegisteredFieldElement,
      getSnapshot,
      openRegisteredDialog,
      registerDialog,
      registerField,
      registerFrontendTool,
      registerSlice,
    ]
  );

  const snapshotValue = useMemo<AgentUiSnapshotValue>(
    () => ({ snapshot }),
    [snapshot]
  );

  return (
    <AgentUiActionsContext.Provider value={actionsValue}>
      <AgentUiToolsContext.Provider value={frontendToolDefinitions}>
        <AgentUiSnapshotContext.Provider value={snapshotValue}>
          {children}
        </AgentUiSnapshotContext.Provider>
      </AgentUiToolsContext.Provider>
    </AgentUiActionsContext.Provider>
  );
}
