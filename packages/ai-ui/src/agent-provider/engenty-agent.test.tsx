/** @vitest-environment happy-dom */
import { act, cleanup, render } from "@testing-library/react";
import { memo, type ReactNode, useCallback, useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  EngentyAgent,
  useAgentHost,
  useAgentHostConfig,
  useSetTurnContext,
} from "./engenty-agent.js";
import { EngentyAI, useEngentyAIContext } from "./engenty-ai-provider.js";
import { ENGENTY_COPILOT_HOST_KEY } from "./host-keys.js";
import type { AgentHost, EngentyAgentProps, HostConfig } from "./types.js";

// Generic EngentyAgent contract tests. Covers the AgentHost shape consumed by every
// hostKey host (active copilot, kb:search, module action hosts). Main copilot
// hydration rules live in `packages/ai-ui/src/copilot/active-copilot-controller.test.ts`.

const MAIN_COPILOT_HOST_KEY = ENGENTY_COPILOT_HOST_KEY;
const SECONDARY_TEST_HOST_KEY = "test:secondary-host";

const routeContext = {
  moduleId: "engenty-copilot",
  pathname: "/mdl/engenty-copilot/chat/new",
  routeKey: "chat",
};

// Dynamic import keeps `vi.spyOn` happy with TS — `import * as` namespaces
// are read-only and trigger a `never` constraint on the second argument.
type AppsAiSessionModule =
  typeof import("../ag-ui/apps-ai/use-engenty-ag-ui-apps-ai-session.js");
type SessionHook = AppsAiSessionModule["useEngentyAgUiAppsAiSession"];
type SessionMock = ReturnType<SessionHook>;
type SessionMockOverrides = Partial<SessionMock>;
type CapturedOptions = Parameters<SessionHook>[0];

interface SessionSpyHandle {
  capturedOptions: CapturedOptions[];
  module: AppsAiSessionModule;
}

async function installSessionSpy(
  buildResult: (options: CapturedOptions) => SessionMockOverrides = () => ({})
): Promise<SessionSpyHandle> {
  const capturedOptions: CapturedOptions[] = [];
  const mod = await import(
    "../ag-ui/apps-ai/use-engenty-ag-ui-apps-ai-session.js"
  );
  vi.spyOn(mod, "useEngentyAgUiAppsAiSession").mockImplementation((options) => {
    capturedOptions.push(options);
    const overrides = buildResult(options);
    return {
      activeThreadId: options.threadId ?? null,
      awaitingInterrupt: false,
      cancel: () => {},
      clearPendingSend: () => {},
      copilotMessages: [],
      error: null,
      messages: [],
      pendingSend: null,
      reset: () => {},
      resumeInterrupt: () => {},
      resumeActiveRun: () => {},
      threadResetKey: 0,
      status: "ready" as const,
      submitMessage: () => {},
      ...overrides,
    } as SessionMock;
  });
  return { capturedOptions, module: mod };
}

function AgentHarness({
  children,
  initialMessages,
  threadId,
}: {
  children: ReactNode;
  initialMessages?: EngentyAgentProps["initialMessages"];
  threadId: string | null;
}) {
  return (
    <EngentyAI
      executeFrontendTool={() => null}
      serviceBaseUrl="http://127.0.0.1:43110"
      tenantId="tenant-1"
      userId="user-1"
    >
      <EngentyAgent
        agentId="engenty.copilot"
        hostKey={MAIN_COPILOT_HOST_KEY}
        initialMessages={initialMessages}
        modelId="openai/gpt-5-mini"
        routeContext={routeContext}
        threadId={threadId}
      >
        {children}
      </EngentyAgent>
    </EngentyAI>
  );
}

function AiHarness({ children }: { children: ReactNode }) {
  return (
    <EngentyAI
      executeFrontendTool={() => null}
      serviceBaseUrl="http://127.0.0.1:43110"
      tenantId="tenant-1"
      userId="user-1"
    >
      {children}
    </EngentyAI>
  );
}

function TestAgent({
  hostKey,
  children,
  threadId,
}: {
  hostKey: string;
  children: ReactNode;
  threadId: string | null;
}) {
  return (
    <EngentyAgent
      agentId="engenty.copilot"
      hostKey={hostKey}
      modelId="openai/gpt-5-mini"
      routeContext={routeContext}
      threadId={threadId}
    >
      {children}
    </EngentyAgent>
  );
}

describe("EngentyAgent generic contract", () => {
  let session: SessionSpyHandle;

  beforeEach(async () => {
    session = await installSessionSpy();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  it("exposes the same host to consumers across rerenders with stable props", () => {
    const firstConsumerHosts: AgentHost[] = [];
    const secondConsumerHosts: AgentHost[] = [];

    function FirstConsumer() {
      firstConsumerHosts.push(useAgentHost(MAIN_COPILOT_HOST_KEY));
      return null;
    }

    function SecondConsumer() {
      secondConsumerHosts.push(useAgentHost(MAIN_COPILOT_HOST_KEY));
      return null;
    }

    const view = render(
      <AgentHarness threadId="session-1">
        <FirstConsumer />
        <SecondConsumer />
      </AgentHarness>
    );

    view.rerender(
      <AgentHarness threadId="session-1">
        <FirstConsumer />
        <SecondConsumer />
      </AgentHarness>
    );

    expect(firstConsumerHosts).toHaveLength(2);
    expect(secondConsumerHosts).toHaveLength(2);
    expect(firstConsumerHosts[0]).toBe(secondConsumerHosts[0]);
    expect(firstConsumerHosts[1]).toBe(secondConsumerHosts[1]);
    expect(firstConsumerHosts[0]?.threadId).toBe("session-1");
    expect(firstConsumerHosts[1]?.threadId).toBe("session-1");
  });

  it("ignores threadId in configureHost; session id comes from props only", () => {
    const hostRef: { current: AgentHost | null } = { current: null };

    function Consumer() {
      hostRef.current = useAgentHost(MAIN_COPILOT_HOST_KEY);
      return null;
    }

    const view = render(
      <AgentHarness threadId="session-1">
        <Consumer />
      </AgentHarness>
    );

    expect(hostRef.current?.threadId).toBe("session-1");

    act(() => {
      hostRef.current?.configureHost({
        threadId: "session-2",
      } as Partial<HostConfig>);
    });

    expect(hostRef.current?.threadId).toBe("session-1");

    view.rerender(
      <AgentHarness threadId="session-2">
        <Consumer />
      </AgentHarness>
    );

    expect(hostRef.current?.threadId).toBe("session-2");
  });

  it("keeps explicit hostKey hosts independent", () => {
    const mainCopilotHosts: AgentHost[] = [];
    const secondaryHosts: AgentHost[] = [];

    function MainCopilotConsumer() {
      mainCopilotHosts.push(useAgentHost());
      return null;
    }

    function SecondaryConsumer() {
      secondaryHosts.push(useAgentHost());
      return null;
    }

    const view = render(
      <AiHarness>
        <TestAgent hostKey={MAIN_COPILOT_HOST_KEY} threadId="main-session">
          <MainCopilotConsumer />
        </TestAgent>
        <TestAgent
          hostKey={SECONDARY_TEST_HOST_KEY}
          threadId="secondary-session"
        >
          <SecondaryConsumer />
        </TestAgent>
      </AiHarness>
    );

    expect(mainCopilotHosts[0]?.hostKey).toBe(MAIN_COPILOT_HOST_KEY);
    expect(secondaryHosts[0]?.hostKey).toBe(SECONDARY_TEST_HOST_KEY);
    expect(mainCopilotHosts[0]?.threadId).toBe("main-session");
    expect(secondaryHosts[0]?.threadId).toBe("secondary-session");
    expect(mainCopilotHosts[0]).not.toBe(secondaryHosts[0]);

    view.rerender(
      <AiHarness>
        <TestAgent hostKey={MAIN_COPILOT_HOST_KEY} threadId="main-session-2">
          <MainCopilotConsumer />
        </TestAgent>
        <TestAgent
          hostKey={SECONDARY_TEST_HOST_KEY}
          threadId="secondary-session"
        >
          <SecondaryConsumer />
        </TestAgent>
      </AiHarness>
    );

    expect(mainCopilotHosts.at(-1)?.threadId).toBe("main-session-2");
    expect(secondaryHosts.at(-1)?.threadId).toBe("secondary-session");
  });

  it("registers and unregisters only the host that unmounts", () => {
    const snapshots: Array<{
      secondary: AgentHost | null;
      mainCopilot: AgentHost | null;
    }> = [];

    function RegistryProbe() {
      const ai = useEngentyAIContext();
      useEffect(() => {
        snapshots.push({
          secondary: ai.resolveHost(SECONDARY_TEST_HOST_KEY),
          mainCopilot: ai.resolveHost(MAIN_COPILOT_HOST_KEY),
        });
      });
      return null;
    }

    function View({ showSecondary }: { showSecondary: boolean }) {
      return (
        <AiHarness>
          <TestAgent hostKey={MAIN_COPILOT_HOST_KEY} threadId="main-session">
            <div />
          </TestAgent>
          {showSecondary ? (
            <TestAgent
              hostKey={SECONDARY_TEST_HOST_KEY}
              threadId="secondary-session"
            >
              <div />
            </TestAgent>
          ) : null}
          <RegistryProbe />
        </AiHarness>
      );
    }

    const view = render(<View showSecondary />);

    expect(snapshots.at(-1)?.mainCopilot?.threadId).toBe("main-session");
    expect(snapshots.at(-1)?.secondary?.threadId).toBe("secondary-session");

    view.rerender(<View showSecondary={false} />);

    expect(snapshots.at(-1)?.mainCopilot?.threadId).toBe("main-session");
    expect(snapshots.at(-1)?.secondary).toBeNull();
  });

  it("chains parent and child onThreadCreated callbacks", () => {
    const parentCalls: string[] = [];
    const childCalls: string[] = [];

    // Both callbacks must be stable (useCallback) — `useAgentHostConfig`
    // depends on `onThreadCreated` identity in its effect; a fresh function
    // each render would trigger an infinite bind loop.
    function ChildBinder() {
      const handleChildCreated = useCallback((id: string) => {
        childCalls.push(id);
      }, []);
      useAgentHostConfig({
        agentId: "engenty.copilot",
        hostKey: MAIN_COPILOT_HOST_KEY,
        onThreadCreated: handleChildCreated,
        routeContext,
      });
      return null;
    }

    function Harness() {
      const handleParentCreated = useCallback((id: string) => {
        parentCalls.push(id);
      }, []);
      return (
        <AiHarness>
          <EngentyAgent
            agentId="engenty.copilot"
            hostKey={MAIN_COPILOT_HOST_KEY}
            modelId=""
            onThreadCreated={handleParentCreated}
            routeContext={routeContext}
            threadId={null}
          >
            <ChildBinder />
          </EngentyAgent>
        </AiHarness>
      );
    }

    render(<Harness />);

    const lastOptions = session.capturedOptions.at(-1);
    lastOptions?.onThreadCreated?.("session-fresh");

    expect(parentCalls).toEqual(["session-fresh"]);
    expect(childCalls).toEqual(["session-fresh"]);
  });

  it("forwards stableSessionKey to the apps/ai session hook", () => {
    const stableSessionKey = "engenty-agent-affinity:active-v1:t:u:agent";

    render(
      <AiHarness>
        <EngentyAgent
          agentId="engenty.copilot"
          hostKey={MAIN_COPILOT_HOST_KEY}
          modelId="openai/gpt-5-mini"
          routeContext={routeContext}
          stableSessionKey={stableSessionKey}
          threadId={null}
        >
          <div />
        </EngentyAgent>
      </AiHarness>
    );

    expect(session.capturedOptions.at(-1)?.stableSessionKey).toBe(
      stableSessionKey
    );
  });

  it("propagates host copilotMessages from the AG-UI session hook", async () => {
    // Restore the beforeEach spy and install one that returns scripted
    // copilot messages so we can assert the host reflects what the AG-UI
    // session produces (the adapter logic itself is covered elsewhere).
    vi.restoreAllMocks();
    const handle = await installSessionSpy(() => ({
      copilotMessages: [
        {
          id: "assistant-1",
          role: "assistant",
          parts: [
            {
              type: "dynamic-tool",
              toolCallId: "tool-1",
              toolName: "engenty_tools_search",
              state: "output-available",
              input: { query: "contacts" },
              output: { ok: true },
            },
            { type: "text", text: "Done." },
          ],
        },
      ] as SessionMock["copilotMessages"],
    }));
    session = handle;

    const hostRef: { current: AgentHost | null } = { current: null };

    function Consumer() {
      hostRef.current = useAgentHost(MAIN_COPILOT_HOST_KEY);
      return null;
    }

    render(
      <AgentHarness threadId="session-1">
        <Consumer />
      </AgentHarness>
    );

    expect(hostRef.current?.copilotMessages).toEqual([
      {
        id: "assistant-1",
        role: "assistant",
        parts: [
          {
            type: "dynamic-tool",
            toolCallId: "tool-1",
            toolName: "engenty_tools_search",
            state: "output-available",
            input: { query: "contacts" },
            output: { ok: true },
          },
          { type: "text", text: "Done." },
        ],
      },
    ]);
  });

  it("survives routeContext ref churn from child host patches", () => {
    const scope = { task_id: "task-1", task_identifier: "ENG-1" };
    const makeRouteContext = (): EngentyAgentProps["routeContext"] => ({
      moduleId: "tasks",
      pathname: "/mdl/tasks/task-1",
      routeKey: "detail",
      scope,
    });

    function Child({
      routeContext: childRouteContext,
    }: {
      routeContext: EngentyAgentProps["routeContext"];
    }) {
      useAgentHostConfig({
        agentId: "tasks.assist",
        hostKey: SECONDARY_TEST_HOST_KEY,
        routeContext: childRouteContext,
      });
      return null;
    }

    function View({ version }: { version: number }) {
      void version;
      return (
        <AiHarness>
          <EngentyAgent
            agentId="tasks.assist"
            hostKey={SECONDARY_TEST_HOST_KEY}
            modelId=""
            routeContext={makeRouteContext()}
            threadId={null}
          >
            <Child routeContext={makeRouteContext()} />
          </EngentyAgent>
        </AiHarness>
      );
    }

    const view = render(<View version={0} />);

    for (let index = 1; index <= 10; index += 1) {
      expect(() => {
        view.rerender(<View version={index} />);
      }).not.toThrow();
    }
  });

  it("keeps host hydrateEnabled when a child bound hydrateEnabled: false", () => {
    function ChildBinder() {
      useAgentHostConfig({
        agentId: "engenty.copilot",
        hostKey: MAIN_COPILOT_HOST_KEY,
        hydrateEnabled: false,
        routeContext,
      });
      return null;
    }

    render(
      <AiHarness>
        <EngentyAgent
          agentId="engenty.copilot"
          hostKey={MAIN_COPILOT_HOST_KEY}
          hydrateEnabled
          modelId=""
          routeContext={routeContext}
          threadId="session-from-url"
        >
          <ChildBinder />
        </EngentyAgent>
      </AiHarness>
    );

    act(() => {});

    expect(session.capturedOptions.at(-1)?.hydrateEnabled).toBe(true);
  });

  it("configureHost is idempotent for routeContext ref churn with identical scope", () => {
    const hostRef: { current: AgentHost | null } = { current: null };
    const scope = { task_id: "task-1" };
    const makeRouteContext = (): EngentyAgentProps["routeContext"] => ({
      moduleId: "tasks",
      pathname: "/mdl/tasks/task-1",
      routeKey: "detail",
      scope,
    });

    function Consumer() {
      hostRef.current = useAgentHost(SECONDARY_TEST_HOST_KEY);
      return null;
    }

    render(
      <AiHarness>
        <EngentyAgent
          agentId="tasks.assist"
          hostKey={SECONDARY_TEST_HOST_KEY}
          modelId=""
          routeContext={makeRouteContext()}
          threadId={null}
        >
          <Consumer />
        </EngentyAgent>
      </AiHarness>
    );

    act(() => {
      hostRef.current?.configureHost({ routeContext: makeRouteContext() });
      hostRef.current?.configureHost({ routeContext: makeRouteContext() });
    });

    expect(hostRef.current?.config.routeContext.scope).toEqual(scope);
  });

  it("stamps live path through setTurnContext without rebuilding the host", () => {
    const hostRenders = { count: 0 };
    const setterRenders = { count: 0 };

    const HostProbe = memo(function HostProbe() {
      hostRenders.count += 1;
      useAgentHost(MAIN_COPILOT_HOST_KEY);
      return null;
    });

    const SetterProbe = memo(function SetterProbe() {
      setterRenders.count += 1;
      const setTurnContext = useSetTurnContext();
      return (
        <button
          onClick={() =>
            setTurnContext({
              pathname: "/s/matthias",
              routeContext: {
                ...routeContext,
                pathname: "/s/matthias",
              },
            })
          }
          type="button"
        >
          stamp
        </button>
      );
    });

    const view = render(
      <AgentHarness threadId={null}>
        <HostProbe />
        <SetterProbe />
      </AgentHarness>
    );

    const hostAfterMount = hostRenders.count;
    const setterAfterMount = setterRenders.count;

    act(() => {
      view.getByRole("button", { name: "stamp" }).click();
    });

    expect(hostRenders.count).toBe(hostAfterMount);
    expect(setterRenders.count).toBe(setterAfterMount);
    expect(
      session.capturedOptions.at(-1)?.turnContextRef?.current.pathname
    ).toBe("/s/matthias");
  });
});
