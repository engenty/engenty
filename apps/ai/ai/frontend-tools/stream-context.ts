import { AsyncLocalStorage } from "node:async_hooks";

import type { AGUIEvent, FrontendToolDefinition } from "@engenty/ag-ui-bridge";

export interface FrontendToolStreamContext {
  emit: (event: AGUIEvent) => void;
  mergedDefinitions: FrontendToolDefinition[];
  runId: string;
}

export const frontendToolStreamAls =
  new AsyncLocalStorage<FrontendToolStreamContext>();
