// Function agents (PLAN-agent-hooks): agents authored as hook-composed
// functions, rendered into a plain AgentConfig per resolution. The provider
// is the async shell around the sync render — it loads the thread's
// `agent_state` snapshot before rendering and hands setters a persist
// channel, so the render itself stays a pure composition pass (D2/D3).
import {
  type AgentFnDescriptor,
  type AgentRenderContext,
  type AgentResolveContext,
  createHookStateStore,
  renderAgentFn,
} from "@engenty/ai-core";
import type {
  AgentConfig,
  AiRegistryProvider,
  MastraToolDefinition,
} from "./types.js";

/**
 * Durable read/write channel for per-thread hook state. Kept as a seam so
 * the provider is testable without a session store; the production channel
 * is {@link createSessionAgentStateChannel}.
 */
export interface FunctionAgentStateChannel {
  load(context: AgentResolveContext): Promise<Record<string, unknown>>;
  persist(
    context: AgentResolveContext,
    state: Record<string, unknown>
  ): Promise<void>;
}

/** Static list, or a lazy source (module capabilities load async). */
export type FunctionAgentSource =
  | AgentFnDescriptor[]
  | (() => Promise<AgentFnDescriptor[]>);

export class FunctionAgentProvider implements AiRegistryProvider {
  readonly providerId = "function";

  private readonly source: FunctionAgentSource;
  private readonly stateChannel: FunctionAgentStateChannel | undefined;
  private loaded?: Promise<Map<string, AgentFnDescriptor>>;

  constructor(
    source: FunctionAgentSource,
    stateChannel?: FunctionAgentStateChannel
  ) {
    this.source = source;
    this.stateChannel = stateChannel;
  }

  async getAgentConfig(
    id: string,
    context?: AgentResolveContext
  ): Promise<AgentConfig | undefined> {
    const descriptor = (await this.descriptors()).get(id);
    if (!descriptor) {
      return;
    }
    return renderAgentFn(
      descriptor,
      await this.renderContext(context)
    ) as AgentConfig;
  }

  async getTool(_id: string): Promise<MastraToolDefinition | undefined> {
    // Inline tools ride the RENDERED_TOOLS symbol channel on the rendered
    // config (D4) — there are no registry-addressable function tools.
    return;
  }

  async listAgentConfigs(): Promise<AgentConfig[]> {
    // Catalog listings render bare: default state, the agent's base face.
    // This doubles as the "renders under default state" purity invariant.
    return [...(await this.descriptors()).values()].map(
      (descriptor) => renderAgentFn(descriptor) as AgentConfig
    );
  }

  private descriptors(): Promise<Map<string, AgentFnDescriptor>> {
    this.loaded ??= (
      Array.isArray(this.source) ? Promise.resolve(this.source) : this.source()
    ).then((list) => new Map(list.map((d) => [d.id, d])));
    return this.loaded;
  }

  private async renderContext(
    context: AgentResolveContext | undefined
  ): Promise<AgentRenderContext | undefined> {
    if (!(context && this.stateChannel)) {
      return;
    }
    const channel = this.stateChannel;
    const snapshot = new Map(Object.entries(await channel.load(context)));
    return {
      snapshot,
      store: createHookStateStore({
        persist: (state) => channel.persist(context, state),
        snapshot,
      }),
    };
  }
}

/**
 * Minimal session-store surface the state channel needs — matches
 * `ThreadStore` structurally so the DAL type never crosses into this
 * module's tests.
 */
export interface AgentStateSessionStore {
  getThread(params: {
    tenantId: string;
    threadId: string;
  }): Promise<{ metadata?: Record<string, unknown> | null } | null>;
  updateThreadForUser(params: {
    metadata?: Record<string, unknown>;
    tenantId: string;
    threadId: string;
    userId: string;
  }): Promise<{ thread: unknown | null }>;
}

const AGENT_STATE_KEY = "agent_state";

/**
 * Production state channel: hook state lives under ONE metadata key
 * (`metadata.agent_state`) so session-service metadata healing never touches
 * individual entries. Persist is read-merge-write through the ownership-
 * checked `updateSessionForUser`; a rejected write (foreign thread) throws
 * loudly — a transition tool must fail visibly, never lose state silently.
 */
export function createSessionAgentStateChannel(
  getStore: () => AgentStateSessionStore | null
): FunctionAgentStateChannel {
  return {
    async load(context) {
      const thread = await getStore()?.getThread({
        tenantId: context.tenantId,
        threadId: context.threadId,
      });
      const state = thread?.metadata?.[AGENT_STATE_KEY];
      return isRecord(state) ? state : {};
    },
    async persist(context, state) {
      const store = getStore();
      if (!store) {
        throw new Error("agent_state persist: no thread store behind this run");
      }
      const thread = await store.getThread({
        tenantId: context.tenantId,
        threadId: context.threadId,
      });
      const { thread: updated } = await store.updateThreadForUser({
        metadata: { ...(thread?.metadata ?? {}), [AGENT_STATE_KEY]: state },
        tenantId: context.tenantId,
        threadId: context.threadId,
        userId: context.userId,
      });
      if (!updated) {
        throw new Error(
          `agent_state persist rejected for thread ${context.threadId}: not owned by user ${context.userId}`
        );
      }
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
