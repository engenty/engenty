// The `browser_*` tools an agent gets for its window in the Space's browser
// (PLAN-user-browser.md §2.3–2.4; PLAN-space-owned-connections.md).
//
// Mastra's `AgentBrowser` supplies the tools; they reach the agent WRAPPED,
// through the normal `tools` map rather than `Agent({ browser })`, because the
// wrapper is the one place where the seat, the unattended gate, the audit
// event and the last-use stamp live. D11: the set is attached only when the
// Space has a browser (running or stopped), or allows agents to start one
// (`autostart`). Without either, a run gets one small `browser_start` tool
// that asks a person for permission to start — everything else keeps the
// ~18 KB of schema out of its prompt.

import {
  createClassifierClient,
  createRequestDecisionArtifact,
  type ResolvedClassifier,
} from "@engenty/ai-core";
import { createLogger } from "@engenty/telemetry";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import {
  acquireFrontendToolSuspendSlot,
  releaseFrontendToolSuspendSlot,
} from "../../../ai/frontend-tools/frontend-tool-suspend-lock.js";
import { getEngentyToolsRunContext } from "../../../ai/tools/engenty-tools/lib/run-context.js";
import { requestDecisionResumeSchema } from "../../../ai/tools/request-decision/native-request-decision.js";
import type { MastraToolDefinition } from "../registry/types.js";
import {
  buildUserBrowserSandboxId,
  markUserBrowserUsed,
  readUserBrowserStatus,
  startUserBrowser,
} from "../sandbox/space-browser.js";
import {
  BROWSER_SIGN_IN_TOOL_ID,
  createSignInTool,
} from "./browser-sign-in-tool.js";
import {
  createFieldText,
  type FastLoopPage,
  isFastLoopEnabled,
  resolveFastLoopMaxSteps,
  resolveFastLoopMinMargin,
  runFastLoop,
} from "./fast-loop/index.js";
import {
  acquireAgentSeat,
  type BrowserWindowIdentity,
  browserWindowKey,
  ensureBrowserWindow,
  getSeat,
  getUserBrowser,
  releaseAgentSeat,
  releaseUserSeat,
  takeUserSeat,
} from "./user-browser-registry.js";

const logger = createLogger({ name: "apps/ai/user-browser-tools" });

export const BROWSER_REQUEST_USER_TOOL_ID = "browser_request_user";
/** The seat switch without waiting: hand the page to the person, or take it back. */
export const BROWSER_HAND_OVER_TOOL_ID = "browser_hand_over";
export const BROWSER_START_TOOL_ID = "browser_start";
/** Experimental (PLAN-browser-fast-loop.md): a classifier drives bounded sub-goals. */
export const BROWSER_RUN_FAST_TOOL_ID = "browser_run_fast";
/** The decision-card answer that lets the agent create the browser. */
export const BROWSER_ALLOW_START_CHOICE_ID = "browser_allow_start";
const BROWSER_DECLINE_START_CHOICE_ID = "browser_decline_start";
/** The run-event lane's name for one agent browser step (audit, D4). */
export const BROWSER_ACTION_EVENT_NAME = "engenty.browser.action";

export interface UserBrowserToolsInput {
  /**
   * The Space whose browser this run uses, the agent whose window it drives,
   * and the Space's standing consents (`resolveRunBrowser`).
   */
  browser:
    | {
        agentId: string;
        autostart?: boolean;
        spaceId: string;
        unattended: boolean;
      }
    | null
    | undefined;
  /**
   * The run's `classifier` binding (`modelConfig.classifierModelId`): the fast
   * loop's step picker. No reachable classifier, no `browser_run_fast`.
   */
  classifierModelId?: string | null;
  /** Audit sink — the lane's run-event emitter. Agent steps only. */
  emit?: (name: string, value: Record<string, unknown>) => void;
  /** No human at the keyboard: routine fires, task jobs, delegated children. */
  headless: boolean;
  tenantId: string;
  /**
   * The run's low-tier model (`modelConfig.gradedModelIds.low`) for the fast
   * loop's field values; the `model.low` seed when the run resolved none.
   */
  textModelId?: string | null;
}

const NEEDS_USER_UNATTENDED =
  "This run is unattended and this Space has not allowed agents to use its browser while nobody is watching. The browser was NOT touched. Do not retry; finish without it and say what you needed the browser for.";
const NEEDS_USER_START =
  "Nobody is at the keyboard for this run, and this Space has not allowed agents to start its browser on their own. No browser was started. Finish without it and report what you needed the browser for.";

/** Tool arguments as the audit trail keeps them: shape, not payload. */
function redactForAudit(input: unknown): unknown {
  if (typeof input === "string") {
    return input.length > 200 ? `${input.slice(0, 200)}…` : input;
  }
  if (Array.isArray(input)) {
    return input.slice(0, 20).map(redactForAudit);
  }
  if (input && typeof input === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      out[key] = redactForAudit(value);
    }
    return out;
  }
  return input;
}

function suspendLockKey(): string {
  const ctx = getEngentyToolsRunContext();
  return (
    ctx.orchestratorThreadId?.trim() ||
    ctx.userFacingThreadId?.trim() ||
    ctx.runId?.trim() ||
    "__untagged__"
  );
}

const HAND_BACK_CHOICE_ID = "browser_hand_back";
const DECLINE_CHOICE_ID = "browser_decline";

/**
 * Suspend the run and hand the agent's window to the person — for a login, a
 * captcha, a consent screen. The park is a DECISION artifact, so the chat
 * renders the card it already knows (title = the agent's reason, two
 * choices) and the person answers it after doing the thing in their live
 * view. "Hand back" resumes the run; "Decline" resumes it with a refusal.
 * Headless: nobody can answer, so the run is told to stop.
 */
function createRequestUserTool(input: {
  headless: boolean;
  identity: BrowserWindowIdentity;
  windowKey: string;
}) {
  return createTool({
    id: BROWSER_REQUEST_USER_TOOL_ID,
    description:
      "Hand your browser window to the person and WAIT: use when a page needs something only the person can give — a login, a one-time code, a captcha, a consent — or when you are unsure a click is what they want. Say in `reason` what they should do. The window opens for them with the controls already theirs; the tool returns once they hand it back, and the controls are yours again. Then take a fresh browser_snapshot before continuing.",
    inputSchema: z.object({
      reason: z
        .string()
        .min(1)
        .max(500)
        .describe("What the person should do in the browser, one sentence."),
    }),
    resumeSchema: requestDecisionResumeSchema,
    execute: async (inputData, ctx) => {
      const resume = ctx.agent?.resumeData as
        | z.infer<typeof requestDecisionResumeSchema>
        | undefined;
      const lockKey = suspendLockKey();
      if (resume) {
        releaseFrontendToolSuspendSlot(lockKey);
        // Whatever they answered, the page is the agent's to drive again.
        releaseUserSeat(input.windowKey);
        const declined =
          resume.cancelled === true ||
          resume.choice_id === DECLINE_CHOICE_ID ||
          (resume.choices ?? []).some((c) => c.id === DECLINE_CHOICE_ID);
        return (
          declined
            ? "The person declined to take the browser. Do not ask again for the same thing; finish without it and say what you needed."
            : "The person is done in the browser and handed it back. Take a fresh browser_snapshot before you continue — the page may have changed."
        ) as never;
      }
      if (
        input.headless ||
        !getEngentyToolsRunContext().canSuspendForInteraction
      ) {
        return {
          reason: "no_human_channel",
          status: "needs_user",
          note: "Nobody is at the keyboard for this run; the browser could not be handed over. Finish without it and report what the person needs to do.",
          requested: inputData.reason,
        } as never;
      }
      // The controls are theirs before they are asked: no "Take over" click
      // stands between the question and the page.
      getUserBrowser(input.identity);
      takeUserSeat(input.windowKey);
      const artifact = createRequestDecisionArtifact({
        body: "The agent's browser window is open and the controls are yours. Do it there, then answer here.",
        choices: [
          {
            description: "I am done in the browser; continue.",
            id: HAND_BACK_CHOICE_ID,
            label: "Hand back",
          },
          {
            description: "Continue without the browser.",
            id: DECLINE_CHOICE_ID,
            label: "Decline",
          },
        ],
        title: inputData.reason,
      });
      const ticket = await acquireFrontendToolSuspendSlot(lockKey);
      try {
        await ctx.agent?.suspend({
          ...artifact,
          browser: {
            agent_id: input.identity.agentId,
            sandbox_id: buildUserBrowserSandboxId(input.identity),
            space_id: input.identity.spaceId,
          },
        });
        releaseFrontendToolSuspendSlot(lockKey, ticket);
      } catch (error) {
        releaseFrontendToolSuspendSlot(lockKey, ticket);
        throw error;
      }
      return undefined as never;
    },
  });
}

/**
 * The seat switch: give the page to the person without waiting for anything
 * ("the search is set up, browse the results yourself"), or take it back
 * once they said they are done in the chat. Every browser_* call the agent
 * makes while the person holds the seat is refused, so "back to me" is what
 * makes the next step possible.
 */
function createHandOverTool(input: {
  emit?: UserBrowserToolsInput["emit"];
  identity: BrowserWindowIdentity;
  windowKey: string;
}) {
  return createTool({
    id: BROWSER_HAND_OVER_TOOL_ID,
    description:
      'Switch who drives your browser window, without waiting. `to: "person"` gives the page to the person in the chat (the window opens with the controls theirs) — say in `note` what they can do there. `to: "agent"` takes the controls back, only after the person said they are done. To hand over AND wait for them, use browser_request_user instead.',
    inputSchema: z.object({
      note: z
        .string()
        .max(300)
        .optional()
        .describe("For the person: what the page is ready for, one sentence."),
      to: z.enum(["person", "agent"]),
    }),
    execute: async (inputData) => {
      const runId = getEngentyToolsRunContext().runId ?? "";
      if (inputData.to === "person") {
        getUserBrowser(input.identity);
        takeUserSeat(input.windowKey);
      } else {
        releaseUserSeat(input.windowKey);
      }
      const holder = getSeat(input.windowKey).holder;
      const seat =
        holder === null ? "free" : holder === "user" ? "user" : "agent";
      input.emit?.(BROWSER_ACTION_EVENT_NAME, {
        input: { note: inputData.note ?? null, to: inputData.to },
        ok: true,
        agent_id: input.identity.agentId,
        run_id: runId,
        seat,
        space_id: input.identity.spaceId,
        tool: BROWSER_HAND_OVER_TOOL_ID,
      });
      return {
        note:
          inputData.to === "person"
            ? 'The person has the window now. Do not touch it until they say they are done; then hand it back to yourself with browser_hand_over to: "agent".'
            : "The browser is yours again. Take a fresh browser_snapshot before you continue — the page may have changed.",
        seat,
      } as never;
    },
  });
}

/**
 * The one tool a run gets when the person has no browser here and has not
 * allowed agents to start one: ask them. The park is a DECISION artifact
 * (Allow / Not now); "Allow" makes the resume lane start the browser BEFORE
 * it rebuilds the toolset (`startUserBrowserOnResume`), so the continuation
 * carries the full `browser_*` set. Headless: nobody can answer.
 */
function createStartTool(input: {
  headless: boolean;
  identity: BrowserWindowIdentity;
}) {
  return createTool({
    id: BROWSER_START_TOOL_ID,
    description:
      "Ask the person for permission to start this Space's browser, and WAIT. Use when a task needs the web (a site to visit, a form to fill, something to read behind a login) and you have no browser_* tools. Say in `reason` what you want to do there. Once they allow it, the browser starts and the browser_* tools (browser_goto, browser_snapshot, browser_click, …) become available to you; begin with browser_goto.",
    inputSchema: z.object({
      reason: z
        .string()
        .min(1)
        .max(500)
        .describe("What you want to do in the browser, one sentence."),
    }),
    resumeSchema: requestDecisionResumeSchema,
    execute: async (inputData, ctx) => {
      const resume = ctx.agent?.resumeData as
        | z.infer<typeof requestDecisionResumeSchema>
        | undefined;
      const lockKey = suspendLockKey();
      if (resume) {
        releaseFrontendToolSuspendSlot(lockKey);
        const allowed =
          resume.cancelled !== true &&
          (resume.choice_id === BROWSER_ALLOW_START_CHOICE_ID ||
            (resume.choices ?? []).some(
              (c) => c.id === BROWSER_ALLOW_START_CHOICE_ID
            ));
        if (!allowed) {
          return "The person did not allow starting the Space's browser. Do not ask again in this conversation; finish without it and say what you needed." as never;
        }
        // The resume lane started it already; make sure, and confirm.
        const status = await readUserBrowserStatus(input.identity);
        if (status.state === "absent") {
          await startUserBrowser(input.identity);
        }
        return "The person allowed it and the Space's browser is running. Use the browser_* tools now, starting with browser_goto." as never;
      }
      if (
        input.headless ||
        !getEngentyToolsRunContext().canSuspendForInteraction
      ) {
        return {
          reason: "no_human_channel",
          status: "needs_user",
          note: NEEDS_USER_START,
          requested: inputData.reason,
        } as never;
      }
      const artifact = createRequestDecisionArtifact({
        body: "A browser for this Space — its logins, cookies and downloads are shared by the Space's agents, each working in its own window; you can watch and take over any time from the monitor icon. Allow it to start?",
        choices: [
          {
            description:
              "Start the Space's browser and let the Engenty use it.",
            id: BROWSER_ALLOW_START_CHOICE_ID,
            label: "Allow",
          },
          {
            description: "Continue without a browser.",
            id: BROWSER_DECLINE_START_CHOICE_ID,
            label: "Not now",
          },
        ],
        title: inputData.reason,
      });
      const ticket = await acquireFrontendToolSuspendSlot(lockKey);
      try {
        await ctx.agent?.suspend({
          ...artifact,
          browser: { start_request: true },
        });
        releaseFrontendToolSuspendSlot(lockKey, ticket);
      } catch (error) {
        releaseFrontendToolSuspendSlot(lockKey, ticket);
        throw error;
      }
      return undefined as never;
    },
  });
}

/**
 * Resume lane, BEFORE the toolset is rebuilt: an "Allow" on the start card
 * creates the browser now, so the continuation's `createUserBrowserTools`
 * sees a stopped/running browser and attaches the full set instead of the
 * ask-tool again. Any other answer, or no browser identity, does nothing.
 */
export async function startUserBrowserOnResume(
  input: Pick<UserBrowserToolsInput, "browser" | "tenantId">,
  resumeData: unknown
): Promise<void> {
  const choice =
    resumeData && typeof resumeData === "object"
      ? (resumeData as { choice_id?: unknown }).choice_id
      : undefined;
  if (choice !== BROWSER_ALLOW_START_CHOICE_ID) {
    return;
  }
  if (!input.browser) {
    return;
  }
  const identity: BrowserWindowIdentity = {
    agentId: input.browser.agentId,
    spaceId: input.browser.spaceId,
    tenantId: input.tenantId,
  };
  try {
    const status = await readUserBrowserStatus(identity);
    if (status.state === "absent") {
      await startUserBrowser(identity);
    }
  } catch (err) {
    // The tool's own resume branch retries and surfaces the failure.
    logger.warn("browser start on resume failed", {
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Wrap one Mastra browser tool with the seat, the unattended gate, the
 * wake-on-first-use and the audit event.
 */
function wrapBrowserTool(params: {
  emit?: UserBrowserToolsInput["emit"];
  headless: boolean;
  id: string;
  identity: BrowserWindowIdentity;
  tool: {
    description: string;
    execute?: (inputData: unknown, ctx: unknown) => Promise<unknown>;
    inputSchema?: unknown;
  };
  unattended: boolean;
}) {
  const { identity } = params;
  const sandboxId = buildUserBrowserSandboxId(identity);
  const windowKey = browserWindowKey(identity);
  return createTool({
    id: params.id,
    description: params.tool.description,
    inputSchema: params.tool.inputSchema as z.ZodTypeAny,
    execute: async (inputData, ctx) => {
      const runId = getEngentyToolsRunContext().runId?.trim() || "unknown";
      const audit = (value: Record<string, unknown>) =>
        params.emit?.(BROWSER_ACTION_EVENT_NAME, {
          agent_id: identity.agentId,
          input: redactForAudit(inputData),
          space_id: identity.spaceId,
          tool: params.id,
          ...value,
        });
      if (params.headless && !params.unattended) {
        audit({ ok: false, refused: "unattended_not_granted" });
        return {
          reason: "unattended_not_granted",
          status: "needs_user",
          note: NEEDS_USER_UNATTENDED,
        } as never;
      }
      const seat = acquireAgentSeat(identity, runId);
      if (!seat.ok) {
        audit({ ok: false, refused: seat.error });
        return {
          error: seat.error,
          note:
            seat.error === "held_by_user"
              ? "The person is using your browser window right now. Do not retry in a loop; wait for them to hand it back (browser_request_user) or continue without the browser."
              : "Another run of yours is using your browser window. Try again shortly or continue without it.",
        } as never;
      }
      markUserBrowserUsed(sandboxId);
      const startedAt = Date.now();
      const execute = params.tool.execute;
      if (!execute) {
        return { error: "tool_not_executable" } as never;
      }
      const run = async () => {
        try {
          await ensureBrowserWindow(identity);
        } catch {
          // Asleep (idle-stop), not yet reachable, or never created under
          // `autostart`: start it — a person declared this browser once, or
          // the Space allowed agents to — then connect again.
          await startUserBrowser(identity);
          await ensureBrowserWindow(identity);
        }
        return execute(inputData, ctx);
      };
      try {
        const result = await Promise.race([
          run(),
          seat.interrupted.then(() => INTERRUPTED),
        ]);
        markUserBrowserUsed(sandboxId);
        if (result === INTERRUPTED) {
          audit({
            ms: Date.now() - startedAt,
            ok: false,
            refused: "interrupted_by_user",
          });
          return {
            error: "interrupted_by_user",
            note: "The person took over the browser while this step ran; its result was discarded. Wait for them to hand it back before touching the browser again.",
          } as never;
        }
        audit({ ms: Date.now() - startedAt, ok: true });
        return result as never;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        audit({ error: message, ms: Date.now() - startedAt, ok: false });
        logger.warn("browser window tool failed", {
          message,
          tool: params.id,
          windowKey,
        });
        releaseAgentSeat(windowKey, runId);
        throw err;
      }
    },
  });
}

const INTERRUPTED = Symbol("interrupted_by_user");

const RUN_FAST_DESCRIPTION =
  "Delegate a small, concrete browser sub-goal to the fast executor: on the CURRENT page it reads the visible controls, picks one element per step with a classifier (no LLM), types field values taken from your goal, and repeats until the goal is visibly satisfied or it is unsure. Use it for mechanical sequences — fill and submit a form, pick a date in a calendar, choose an autocomplete suggestion, select dropdown values, open a matching result. Give one page's worth of work per call with every value spelled out (dates, names, filters); it never invents data. Returns status `done`, or `uncertain`/`blocked`/`budget` with the page's element table and a note naming the step it could not decide. Then do THAT ONE step with browser_snapshot and the other browser_* tools and call browser_run_fast again with the same goal — do not finish the rest by hand. Navigate with browser_goto first; it does not open URLs.";

/**
 * `browser_run_fast`: the fast loop as one wrapped tool, so it shares the
 * seat, the unattended gate, wake-on-first-use and the audit event with
 * every other browser step (D1, D3). Offered only with the switch on and the
 * run's classifier binding reachable. Runs on the page Mastra's `AgentBrowser` already
 * holds — `getPage()` is not in the provider's public types but is the
 * method its own tools use; `fast-loop-page.real.test.ts` pins it.
 */
function createRunFastTool(params: {
  classifier: ResolvedClassifier;
  emit?: UserBrowserToolsInput["emit"];
  identity: BrowserWindowIdentity;
  textModelId: string | null;
}) {
  const { identity } = params;
  const windowKey = browserWindowKey(identity);
  return {
    description: RUN_FAST_DESCRIPTION,
    inputSchema: z.object({
      goal: z
        .string()
        .min(1)
        .max(2000)
        .describe(
          "The sub-goal for the current page, with every concrete value it needs (e.g. 'Set departure to 12 Oct 2026 and return to 19 Oct 2026, then click Search')."
        ),
      max_steps: z
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .describe(
          "Step budget for this call; defaults to the platform setting."
        ),
    }),
    execute: async (inputData: unknown) => {
      const input = inputData as { goal: string; max_steps?: number };
      const { classifier } = params;
      const browser = getUserBrowser(identity) as unknown as {
        getPage(): Promise<FastLoopPage>;
      };
      const page = await browser.getPage();
      const runId = getEngentyToolsRunContext().runId?.trim() || "unknown";
      const { client } = classifier;
      const result = await runFastLoop({
        client,
        fieldText: createFieldText({
          ...(params.textModelId ? { modelId: params.textModelId } : {}),
          spans: { client },
        }),
        goal: input.goal,
        maxSteps: Math.min(
          input.max_steps ?? resolveFastLoopMaxSteps(),
          resolveFastLoopMaxSteps()
        ),
        minMargin: resolveFastLoopMinMargin(),
        onStep: (step) =>
          params.emit?.(BROWSER_ACTION_EVENT_NAME, {
            agent_id: identity.agentId,
            fast_step: step,
            space_id: identity.spaceId,
            tool: BROWSER_RUN_FAST_TOOL_ID,
          }),
        page,
        shouldStop: () => {
          const holder = getSeat(windowKey).holder;
          return (
            holder === "user" || (holder !== null && holder.runId !== runId)
          );
        },
      });
      logger.info("browser fast loop finished", {
        elapsed_ms: result.elapsed_ms,
        model: classifier.model,
        route: classifier.route,
        status: result.status,
        steps: result.steps,
        totals: result.totals,
        windowKey,
      });
      return result;
    },
  };
}

/**
 * The browser toolset for a run (D11): the full wrapped set when the Space
 * has a browser (running or stopped) or allows agents to start one
 * (`autostart` — the wrapper's wake-on-first-use then creates it); only
 * `browser_start` (ask a person) when it has neither; `{}` for a run with no
 * Space.
 */
export async function createUserBrowserTools(
  input: UserBrowserToolsInput
): Promise<Record<string, MastraToolDefinition>> {
  if (!input.browser) {
    return {};
  }
  const identity: BrowserWindowIdentity = {
    agentId: input.browser.agentId,
    spaceId: input.browser.spaceId,
    tenantId: input.tenantId,
  };
  let status: Awaited<ReturnType<typeof readUserBrowserStatus>>;
  try {
    status = await readUserBrowserStatus(identity);
  } catch (err) {
    logger.warn("space browser status unavailable; no browser tools", {
      message: err instanceof Error ? err.message : String(err),
    });
    return {};
  }
  if (status.state === "absent" && input.browser.autostart !== true) {
    return {
      [BROWSER_START_TOOL_ID]: createStartTool({
        headless: input.headless,
        identity,
      }) as unknown as MastraToolDefinition,
    };
  }
  const windowKey = browserWindowKey(identity);
  const tools: Record<string, MastraToolDefinition> = {};
  const browser = getUserBrowser(identity);
  for (const [id, tool] of Object.entries(browser.getTools())) {
    tools[id] = wrapBrowserTool({
      emit: input.emit,
      headless: input.headless,
      id,
      identity,
      tool: tool as unknown as Parameters<typeof wrapBrowserTool>[0]["tool"],
      unattended: input.browser.unattended,
    }) as unknown as MastraToolDefinition;
  }
  tools[BROWSER_REQUEST_USER_TOOL_ID] = createRequestUserTool({
    headless: input.headless,
    identity,
    windowKey,
  }) as unknown as MastraToolDefinition;
  tools[BROWSER_SIGN_IN_TOOL_ID] = createSignInTool({
    audit: (value) =>
      input.emit?.(BROWSER_ACTION_EVENT_NAME, {
        agent_id: identity.agentId,
        run_id: getEngentyToolsRunContext().runId ?? "",
        space_id: identity.spaceId,
        tool: BROWSER_SIGN_IN_TOOL_ID,
        ...value,
      }),
    headless: input.headless,
    identity,
    lockKey: suspendLockKey,
    windowKey,
  }) as unknown as MastraToolDefinition;
  if (!input.headless) {
    // Nobody at the keyboard can take the page in a headless run.
    tools[BROWSER_HAND_OVER_TOOL_ID] = createHandOverTool({
      emit: input.emit,
      identity,
      windowKey,
    }) as unknown as MastraToolDefinition;
  }
  const classifier = isFastLoopEnabled(input.classifierModelId)
    ? createClassifierClient(input.classifierModelId)
    : null;
  if (classifier) {
    tools[BROWSER_RUN_FAST_TOOL_ID] = wrapBrowserTool({
      emit: input.emit,
      headless: input.headless,
      id: BROWSER_RUN_FAST_TOOL_ID,
      identity,
      tool: createRunFastTool({
        classifier,
        emit: input.emit,
        identity,
        textModelId: input.textModelId ?? null,
      }),
      unattended: input.browser.unattended,
    }) as unknown as MastraToolDefinition;
  }
  return tools;
}

/** Run end: the agent's seat goes with the run. */
export function releaseUserBrowserForRun(
  input: Pick<UserBrowserToolsInput, "browser" | "tenantId">,
  runId: string
): void {
  if (!input.browser) {
    return;
  }
  releaseAgentSeat(
    browserWindowKey({
      agentId: input.browser.agentId,
      spaceId: input.browser.spaceId,
      tenantId: input.tenantId,
    }),
    runId
  );
}
