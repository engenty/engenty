import { emitAutomationHook } from "./automation-hooks.js";

export const PLUGIN_LIFECYCLE_EVENTS = [
  "plugin.loading",
  "plugin.loaded",
  "plugin.failed",
  "plugin.shutdown",
  "plugin.disposed",
  "plugin.reload",
] as const;

export const PLUGIN_OPERATION_EVENTS = [
  "operation.beforeInvoke",
  "operation.context",
  "operation.afterInvoke",
  "operation.error",
] as const;

// The approval gate's lifecycle, emitted by core for every module's gated
// operations — one name for notification fan-out and tenant triggers, instead
// of each module inventing its own `<module>.approval.requested` flavor.
export const PLUGIN_APPROVAL_EVENTS = [
  "approval.requested",
  "approval.decided",
] as const;

export const PLUGIN_AGENT_EVENTS = [
  "agent.beforeRun",
  "agent.context",
  "agent.toolCall",
  "agent.toolResult",
  "agent.afterRun",
] as const;

export const PLUGIN_FRONTEND_TOOL_EVENTS = [
  "frontendTool.beforeCall",
  "frontendTool.afterResult",
] as const;

export type PluginLifecycleEventName = (typeof PLUGIN_LIFECYCLE_EVENTS)[number];
export type PluginOperationEventName = (typeof PLUGIN_OPERATION_EVENTS)[number];
export type PluginApprovalEventName = (typeof PLUGIN_APPROVAL_EVENTS)[number];
export type PluginAgentEventName = (typeof PLUGIN_AGENT_EVENTS)[number];
export type PluginFrontendToolEventName =
  (typeof PLUGIN_FRONTEND_TOOL_EVENTS)[number];
export type PluginCoreEventName =
  | PluginLifecycleEventName
  | PluginOperationEventName
  | PluginApprovalEventName
  | PluginAgentEventName
  | PluginFrontendToolEventName;
export type PluginModuleEventName = string & {};
export type PluginEventName = PluginCoreEventName | PluginModuleEventName;

export type PluginEventPayload = Readonly<Record<string, unknown>>;

// Canonical entity event payload for `<module>.<entity>.{created,updated,deleted}`.
// `TIdField` locks the entity id field name (e.g. `"contact_id"`, `"article_id"`).
// Subscribers (declarative re-index, telemetry) read these without per-module knowledge.
export type EntityEventPayload<TIdField extends string = string> = Readonly<
  {
    actor_id?: string;
    changed_fields?: readonly string[];
    scope_id?: string;
    tenant_id: string;
  } & {
    [K in TIdField]: string;
  }
>;

// Helper to build the conventional event name. Reject anything else at the
// type level so module authors stay on the canonical naming.
export type EntityEventVerb = "created" | "deleted" | "updated";
export type EntityEventName<
  TModule extends string,
  TEntity extends string,
  TVerb extends EntityEventVerb = EntityEventVerb,
> = `${TModule}.${TEntity}.${TVerb}`;

export interface PluginEventSourceInfo {
  generationId?: number;
  manifestId: string;
  manifestPath: string;
  packageName?: string;
  pluginId: string;
  registrationKind: string;
  rootDir: string;
  source: string;
  sourceType: "builtin" | "module" | "package";
  version?: string;
}

export interface PluginEventContext {
  actorId?: string;
  eventId: string;
  eventName: PluginEventName;
  listenerModuleId?: string;
  principalId?: string;
  sourceInfo?: PluginEventSourceInfo;
  sourceModuleId?: string;
  tenantId?: string;
}

export type PluginEventUnsubscribe = () => void;

export interface PluginEventEmitContext {
  actorId?: string;
  eventId?: string;
  principalId?: string;
  sourceModuleId?: string;
  tenantId?: string;
}

export interface PluginEventListenerOptions {
  capability?: string;
  requiredCapabilities?: string[];
  tenantScoped?: boolean;
}

export interface PluginEventRegistrationReceipt {
  dispose: () => Promise<void> | void;
  generationId?: number;
  id: string;
  kind: string;
  pluginId: string;
  sourceInfo?: PluginEventSourceInfo;
}

export type PluginEventNamespace = "core" | "modules";
export type PluginEventListenerKind = "filter" | "interceptor" | "observer";

export type PluginEventObserver<
  TPayload extends PluginEventPayload = PluginEventPayload,
> = (payload: TPayload, context: PluginEventContext) => void | Promise<void>;

export type PluginEventFilter<
  TPayload extends PluginEventPayload = PluginEventPayload,
> = (
  payload: TPayload,
  context: PluginEventContext
) => TPayload | Promise<TPayload>;

export type PluginEventInterceptorDecision<
  TPayload extends PluginEventPayload = PluginEventPayload,
> =
  | {
      action: "allow";
      payload?: TPayload;
      reason?: string;
    }
  | {
      action: "block";
      reason: string;
    };

export type PluginEventInterceptor<
  TPayload extends PluginEventPayload = PluginEventPayload,
> = (
  payload: TPayload,
  context: PluginEventContext
) =>
  | PluginEventInterceptorDecision<TPayload>
  | undefined
  | Promise<PluginEventInterceptorDecision<TPayload> | undefined>;

export interface PluginInterceptionResult<
  TPayload extends PluginEventPayload = PluginEventPayload,
> {
  action: "allow" | "block";
  payload: TPayload;
  reason?: string;
}

export interface PluginEventsApi {
  core: PluginCoreEventsApi;
  modules: PluginModuleEventsApi;
}

export interface PluginCoreEventsApi {
  emit: <TPayload extends PluginEventPayload = PluginEventPayload>(
    eventName: PluginCoreEventName,
    payload: TPayload,
    context?: PluginEventEmitContext
  ) => Promise<void>;
  filter: <TPayload extends PluginEventPayload = PluginEventPayload>(
    eventName: PluginCoreEventName,
    handler: PluginEventFilter<TPayload>,
    options?: PluginEventListenerOptions
  ) => PluginEventRegistrationReceipt;
  intercept: <TPayload extends PluginEventPayload = PluginEventPayload>(
    eventName: PluginCoreEventName,
    handler: PluginEventInterceptor<TPayload>,
    options?: PluginEventListenerOptions
  ) => PluginEventRegistrationReceipt;
  on: <TPayload extends PluginEventPayload = PluginEventPayload>(
    eventName: PluginCoreEventName,
    handler: PluginEventObserver<TPayload>,
    options?: PluginEventListenerOptions
  ) => PluginEventRegistrationReceipt;
}

export interface PluginModuleEventsApi {
  emit: <TPayload extends PluginEventPayload = PluginEventPayload>(
    eventName: PluginModuleEventName,
    payload: TPayload,
    context?: PluginEventEmitContext
  ) => Promise<void>;
  on: <TPayload extends PluginEventPayload = PluginEventPayload>(
    eventName: PluginModuleEventName,
    handler: PluginEventObserver<TPayload>,
    options?: PluginEventListenerOptions
  ) => PluginEventRegistrationReceipt;
}

export interface PluginEventsRuntime {
  api: PluginEventsApi;
  applyFilters: <TPayload extends PluginEventPayload = PluginEventPayload>(
    eventName: PluginEventName,
    payload: TPayload,
    context?: PluginEventEmitContext
  ) => Promise<TPayload>;
  clear: () => void;
  createApi: (options?: CreatePluginEventsRuntimeOptions) => PluginEventsApi;
  runInterceptors: <TPayload extends PluginEventPayload = PluginEventPayload>(
    eventName: PluginEventName,
    payload: TPayload,
    context?: PluginEventEmitContext
  ) => Promise<PluginInterceptionResult<TPayload>>;
}

export interface CreatePluginEventsRuntimeOptions {
  /**
   * During the transition, module events emitted through the target API also
   * feed the current automation hook bus consumed by core rules/executors.
   */
  bridgeModuleEventsToAutomationHooks?: boolean;
  createRegistrationReceipt?: (params: {
    eventName: PluginEventName;
    key: string;
    kind: string;
    listenerKind: PluginEventListenerKind;
    namespace: PluginEventNamespace;
  }) => PluginEventRegistrationReceipt;
  onRegister?: (
    registration: PluginEventHandlerRegistration
  ) => void | Promise<void>;
  pluginId?: string;
  shouldInvoke?: (params: {
    context: PluginEventContext;
    payload: PluginEventPayload;
    registration: PluginEventHandlerRegistration;
  }) => boolean | Promise<boolean>;
  sourceInfo?: PluginEventSourceInfo;
}

export interface PluginEventHandlerRegistration<THandler = unknown> {
  capability: string;
  eventName: PluginEventName;
  handler: THandler;
  listenerKind: PluginEventListenerKind;
  namespace: PluginEventNamespace;
  pluginId?: string;
  receipt: PluginEventRegistrationReceipt;
  requiredCapabilities: string[];
  shouldInvoke?: CreatePluginEventsRuntimeOptions["shouldInvoke"];
  sourceInfo?: PluginEventSourceInfo;
  tenantScoped: boolean;
}

type HandlerSet<THandler> = Set<PluginEventHandlerRegistration<THandler>>;

const MODULE_EVENT_NAME_PATTERN =
  /^[a-z0-9][a-z0-9-]*(\.[a-z0-9][a-z0-9_-]*)+$/;

const RESERVED_EVENT_NAMES = new Set<string>([
  ...PLUGIN_LIFECYCLE_EVENTS,
  ...PLUGIN_OPERATION_EVENTS,
  ...PLUGIN_AGENT_EVENTS,
  ...PLUGIN_FRONTEND_TOOL_EVENTS,
]);

function validateEventName(
  namespace: PluginEventNamespace,
  eventName: PluginEventName
): PluginEventName {
  if (typeof eventName !== "string" || !eventName.trim()) {
    throw new TypeError("Plugin event registration missing event name.");
  }
  const normalized = eventName.trim();
  if (namespace === "core") {
    if (!RESERVED_EVENT_NAMES.has(normalized)) {
      throw new TypeError(`Invalid core plugin event name: ${normalized}`);
    }
    return normalized as PluginCoreEventName;
  }
  if (
    RESERVED_EVENT_NAMES.has(normalized) ||
    !MODULE_EVENT_NAME_PATTERN.test(normalized)
  ) {
    throw new TypeError(`Invalid module plugin event name: ${normalized}`);
  }
  return normalized as PluginModuleEventName;
}

function assertEventHandler(
  handler: unknown
): asserts handler is (...args: never[]) => unknown {
  if (typeof handler !== "function") {
    throw new TypeError("Plugin event registration missing handler.");
  }
}

function getPayloadTenantId(payload: PluginEventPayload): string | undefined {
  const tenantId = payload.tenant_id ?? payload.tenantId;
  return typeof tenantId === "string" && tenantId.trim()
    ? tenantId.trim()
    : undefined;
}

function createEventId() {
  return `evt_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function normalizeRequiredCapabilities(
  capabilities: string[] | undefined
): string[] {
  return Array.from(
    new Set((capabilities ?? []).map((item) => item.trim()).filter(Boolean))
  );
}

function createContext(params: {
  context?: PluginEventEmitContext;
  entry: PluginEventHandlerRegistration;
  eventName: PluginEventName;
  payload: PluginEventPayload;
}): PluginEventContext {
  return {
    actorId: params.context?.actorId,
    eventId: params.context?.eventId ?? createEventId(),
    eventName: params.eventName,
    listenerModuleId: params.entry.pluginId,
    principalId: params.context?.principalId,
    sourceInfo: params.entry.sourceInfo,
    sourceModuleId: params.context?.sourceModuleId,
    tenantId: params.context?.tenantId ?? getPayloadTenantId(params.payload),
  };
}

function addHandler<THandler>(
  map: Map<string, HandlerSet<THandler>>,
  eventName: PluginEventName,
  handler: THandler,
  params: {
    listenerKind: PluginEventListenerKind;
    namespace: PluginEventNamespace;
    onRegister?: CreatePluginEventsRuntimeOptions["onRegister"];
    options?: PluginEventListenerOptions;
    pluginId?: string;
    receiptFactory?: CreatePluginEventsRuntimeOptions["createRegistrationReceipt"];
    receiptIds: Set<string>;
    shouldInvoke?: CreatePluginEventsRuntimeOptions["shouldInvoke"];
    sourceInfo?: PluginEventSourceInfo;
  }
): PluginEventRegistrationReceipt {
  assertEventHandler(handler);
  const normalizedEventName = validateEventName(params.namespace, eventName);
  const key = String(normalizedEventName);
  const handlers =
    map.get(key) ?? new Set<PluginEventHandlerRegistration<THandler>>();
  const registrationKey = `${key}:${handlers.size + 1}`;
  const kind = `event.${params.listenerKind}`;
  const sourceInfo = params.sourceInfo
    ? { ...params.sourceInfo, registrationKind: kind }
    : undefined;
  const receipt =
    params.receiptFactory?.({
      eventName: normalizedEventName,
      key: registrationKey,
      kind,
      listenerKind: params.listenerKind,
      namespace: params.namespace,
    }) ??
    ({
      dispose: () => {},
      generationId: sourceInfo?.generationId,
      id: `${params.pluginId ?? "anonymous"}:${kind}:${registrationKey}`,
      kind,
      pluginId: params.pluginId ?? "anonymous",
      sourceInfo,
    } satisfies PluginEventRegistrationReceipt);
  if (params.receiptIds.has(receipt.id)) {
    throw new TypeError(`Duplicate plugin event receipt id: ${receipt.id}`);
  }
  params.receiptIds.add(receipt.id);
  let disposed = false;
  let entry: PluginEventHandlerRegistration<THandler>;
  const runtimeReceipt: PluginEventRegistrationReceipt = {
    ...receipt,
    dispose: async () => {
      if (disposed) {
        return;
      }
      disposed = true;
      handlers.delete(entry);
      try {
        await receipt.dispose();
      } finally {
        params.receiptIds.delete(receipt.id);
        if (handlers.size === 0) {
          map.delete(key);
        }
      }
    },
  };
  entry = {
    capability: params.options?.capability?.trim() || `event.${key}`,
    eventName: normalizedEventName,
    handler,
    listenerKind: params.listenerKind,
    namespace: params.namespace,
    pluginId: params.pluginId,
    receipt: runtimeReceipt,
    requiredCapabilities: normalizeRequiredCapabilities(
      params.options?.requiredCapabilities
    ),
    shouldInvoke: params.shouldInvoke,
    sourceInfo: runtimeReceipt.sourceInfo ?? sourceInfo,
    tenantScoped:
      params.options?.tenantScoped ?? params.namespace === "modules",
  };
  handlers.add(entry);
  map.set(key, handlers);
  void params.onRegister?.(entry as PluginEventHandlerRegistration);
  return runtimeReceipt;
}

async function runObservers<TPayload extends PluginEventPayload>(
  handlers: HandlerSet<PluginEventObserver> | undefined,
  eventName: PluginEventName,
  payload: TPayload,
  context: PluginEventEmitContext | undefined,
  options: CreatePluginEventsRuntimeOptions
) {
  if (!handlers) {
    return;
  }
  for (const entry of handlers) {
    const eventContext = createContext({ context, entry, eventName, payload });
    const shouldInvoke = entry.shouldInvoke ?? options.shouldInvoke;
    if (
      shouldInvoke &&
      !(await shouldInvoke({
        context: eventContext,
        payload,
        registration: entry as PluginEventHandlerRegistration,
      }))
    ) {
      continue;
    }
    try {
      await entry.handler(payload, eventContext);
    } catch {
      // Observers must not break the mutation that emitted the event.
    }
  }
}

function createRegisterer(params: {
  filters: Map<string, HandlerSet<PluginEventFilter>>;
  interceptors: Map<string, HandlerSet<PluginEventInterceptor>>;
  namespace: PluginEventNamespace;
  observers: Map<string, HandlerSet<PluginEventObserver>>;
  options: CreatePluginEventsRuntimeOptions & { receiptIds: Set<string> };
}) {
  const common = {
    onRegister: params.options.onRegister,
    pluginId: params.options.pluginId,
    receiptFactory: params.options.createRegistrationReceipt,
    receiptIds: params.options.receiptIds,
    shouldInvoke: params.options.shouldInvoke,
    sourceInfo: params.options.sourceInfo,
  };
  return {
    filter: <TPayload extends PluginEventPayload = PluginEventPayload>(
      eventName: PluginEventName,
      handler: PluginEventFilter<TPayload>,
      options?: PluginEventListenerOptions
    ) =>
      addHandler(params.filters, eventName, handler as PluginEventFilter, {
        ...common,
        listenerKind: "filter",
        namespace: params.namespace,
        options,
      }),
    intercept: <TPayload extends PluginEventPayload = PluginEventPayload>(
      eventName: PluginEventName,
      handler: PluginEventInterceptor<TPayload>,
      options?: PluginEventListenerOptions
    ) =>
      addHandler(
        params.interceptors,
        eventName,
        handler as PluginEventInterceptor,
        {
          ...common,
          listenerKind: "interceptor",
          namespace: params.namespace,
          options,
        }
      ),
    on: <TPayload extends PluginEventPayload = PluginEventPayload>(
      eventName: PluginEventName,
      handler: PluginEventObserver<TPayload>,
      options?: PluginEventListenerOptions
    ) =>
      addHandler(params.observers, eventName, handler as PluginEventObserver, {
        ...common,
        listenerKind: "observer",
        namespace: params.namespace,
        options,
      }),
  };
}

export function createPluginEventsRuntime(
  options: CreatePluginEventsRuntimeOptions = {}
): PluginEventsRuntime {
  const bridgeModuleEventsToAutomationHooks =
    options.bridgeModuleEventsToAutomationHooks ?? true;
  const observers = new Map<string, HandlerSet<PluginEventObserver>>();
  const filters = new Map<string, HandlerSet<PluginEventFilter>>();
  const interceptors = new Map<string, HandlerSet<PluginEventInterceptor>>();
  const receiptIds = new Set<string>();

  const createApi = (
    apiOptions: CreatePluginEventsRuntimeOptions = options
  ): PluginEventsApi => {
    const runtimeOptions = {
      ...options,
      ...apiOptions,
      bridgeModuleEventsToAutomationHooks,
      receiptIds,
    };
    const coreRegisterer = createRegisterer({
      filters,
      interceptors,
      namespace: "core",
      observers,
      options: runtimeOptions,
    });
    const moduleRegisterer = createRegisterer({
      filters,
      interceptors,
      namespace: "modules",
      observers,
      options: runtimeOptions,
    });

    const core: PluginCoreEventsApi = {
      emit: async (eventName, payload, context) => {
        const normalizedEventName = validateEventName("core", eventName);
        await runObservers(
          observers.get(String(normalizedEventName)),
          normalizedEventName,
          payload,
          {
            ...context,
            sourceModuleId: context?.sourceModuleId ?? runtimeOptions.pluginId,
          },
          runtimeOptions
        );
      },
      filter: (eventName, handler, listenerOptions) =>
        coreRegisterer.filter(eventName, handler, listenerOptions),
      intercept: (eventName, handler, listenerOptions) =>
        coreRegisterer.intercept(eventName, handler, listenerOptions),
      on: (eventName, handler, listenerOptions) =>
        coreRegisterer.on(eventName, handler, listenerOptions),
    };

    const modules: PluginModuleEventsApi = {
      emit: async (eventName, payload, context) => {
        const normalizedEventName = validateEventName("modules", eventName);
        if (bridgeModuleEventsToAutomationHooks) {
          emitAutomationHook(String(normalizedEventName), payload);
        }
        await runObservers(
          observers.get(String(normalizedEventName)),
          normalizedEventName,
          payload,
          {
            ...context,
            sourceModuleId: context?.sourceModuleId ?? runtimeOptions.pluginId,
          },
          runtimeOptions
        );
      },
      on: (eventName, handler, listenerOptions) =>
        moduleRegisterer.on(eventName, handler, listenerOptions),
    };

    return {
      core,
      modules,
    };
  };

  return {
    api: createApi(options),
    applyFilters: async <
      TPayload extends PluginEventPayload = PluginEventPayload,
    >(
      eventName: PluginEventName,
      payload: TPayload,
      context?: PluginEventEmitContext
    ) => {
      const handlers = filters.get(String(eventName));
      if (!handlers) {
        return payload;
      }
      let current: PluginEventPayload = payload;
      for (const entry of handlers) {
        const eventContext = createContext({
          context,
          entry,
          eventName,
          payload: current,
        });
        const shouldInvoke = entry.shouldInvoke ?? options.shouldInvoke;
        if (
          shouldInvoke &&
          !(await shouldInvoke({
            context: eventContext,
            payload: current,
            registration: entry as PluginEventHandlerRegistration,
          }))
        ) {
          continue;
        }
        current = await entry.handler(current, eventContext);
      }
      return current as TPayload;
    },
    clear: () => {
      observers.clear();
      filters.clear();
      interceptors.clear();
      receiptIds.clear();
    },
    createApi,
    runInterceptors: async <
      TPayload extends PluginEventPayload = PluginEventPayload,
    >(
      eventName: PluginEventName,
      payload: TPayload,
      context?: PluginEventEmitContext
    ) => {
      const handlers = interceptors.get(String(eventName));
      if (!handlers) {
        return { action: "allow", payload };
      }
      let current: PluginEventPayload = payload;
      for (const entry of handlers) {
        const eventContext = createContext({
          context,
          entry,
          eventName,
          payload: current,
        });
        const shouldInvoke = entry.shouldInvoke ?? options.shouldInvoke;
        if (
          shouldInvoke &&
          !(await shouldInvoke({
            context: eventContext,
            payload: current,
            registration: entry as PluginEventHandlerRegistration,
          }))
        ) {
          continue;
        }
        const decision = await entry.handler(current, eventContext);
        if (!decision) {
          continue;
        }
        if (decision.action === "block") {
          return {
            action: "block",
            payload: current as TPayload,
            reason: decision.reason,
          };
        }
        current = decision.payload ?? current;
      }
      return { action: "allow", payload: current as TPayload };
    },
  };
}
