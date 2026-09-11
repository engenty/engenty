// The `browser_*` tools an agent gets for the acting user's browser
// (PLAN-user-browser.md §2.3–2.4).
//
// Mastra's `AgentBrowser` supplies the tools; they reach the agent WRAPPED,
// through the normal `tools` map rather than `Agent({ browser })`, because the
// wrapper is the one place where the seat, the unattended gate, the audit
// event and the last-use stamp live. D11: the set is attached only when the
// acting user has a browser (running or stopped) in this space, or has
// allowed agents to start one (`autostart`). Without either, a run gets one
// small `browser_start` tool that asks the person for permission to start —
// everything else keeps the ~18 KB of schema out of its prompt.

import { createRequestDecisionArtifact } from "@engenty/ai-core";
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
  type UserBrowserIdentity,
} from "../sandbox/space-browser.js";
import {
  acquireAgentSeat,
  getUserBrowser,
  releaseAgentSeat,
} from "./user-browser-registry.js";

const logger = createLogger({ name: "apps/ai/user-browser-tools" });

export const BROWSER_REQUEST_USER_TOOL_ID = "browser_request_user";
export const BROWSER_START_TOOL_ID = "browser_start";
/** The decision-card answer that lets the agent create the browser. */
export const BROWSER_ALLOW_START_CHOICE_ID = "browser_allow_start";
const BROWSER_DECLINE_START_CHOICE_ID = "browser_decline_start";
/** The run-event lane's name for one agent browser step (audit, D4). */
export const BROWSER_ACTION_EVENT_NAME = "engenty.browser.action";

export interface UserBrowserToolsInput {
  /** From the resolved space: whose browser, and their standing consents. */
  browser:
    | { autostart?: boolean; unattended: boolean; userId: string }
    | null
    | undefined;
  /** Audit sink — the lane's run-event emitter. Agent steps only. */
  emit?: (name: string, value: Record<string, unknown>) => void;
  /** No human at the keyboard: routine fires, task jobs, delegated children. */
  headless: boolean;
  spaceId: string | null | undefined;
  tenantId: string;
}

const NEEDS_USER_UNATTENDED =
  "This run is unattended and the browser's owner has not allowed agents to use their browser while they are away. The browser was NOT touched. Do not retry; finish without it and say what you needed the browser for.";
const NEEDS_USER_START =
  "Nobody is at the keyboard for this run, and the person has not allowed agents to start their browser on their own. No browser was started. Finish without it and report what you needed the browser for.";

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
 * Suspend the run and hand the browser to its owner — for a login, a
 * captcha, a consent screen. The park is a DECISION artifact, so the chat
 * renders the card it already knows (title = the agent's reason, two
 * choices) and the person answers it after doing the thing in their live
 * view. "Hand back" resumes the run; "Decline" resumes it with a refusal.
 * Headless: nobody can answer, so the run is told to stop.
 */
function createRequestUserTool(input: {
  headless: boolean;
  identity: UserBrowserIdentity;
  sandboxId: string;
}) {
  return createTool({
    id: BROWSER_REQUEST_USER_TOOL_ID,
    description:
      "Hand the browser to its owner and WAIT: use when a page needs something only the person can give — a login, a one-time code, a captcha, a consent — or when you are unsure a click is what they want. Say in `reason` what they should do. The tool returns once they hand the browser back; then take a fresh browser_snapshot before continuing.",
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
      const artifact = createRequestDecisionArtifact({
        body: "Open your browser (the monitor icon, or Space settings → Computer → Open), take over, do it there, then answer here.",
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
            sandbox_id: input.sandboxId,
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
 * The one tool a run gets when the person has no browser here and has not
 * allowed agents to start one: ask them. The park is a DECISION artifact
 * (Allow / Not now); "Allow" makes the resume lane start the browser BEFORE
 * it rebuilds the toolset (`startUserBrowserOnResume`), so the continuation
 * carries the full `browser_*` set. Headless: nobody can answer.
 */
function createStartTool(input: {
  headless: boolean;
  identity: UserBrowserIdentity;
}) {
  return createTool({
    id: BROWSER_START_TOOL_ID,
    description:
      "Ask the person for permission to start their own browser in this Space, and WAIT. Use when a task needs the web (a site to visit, a form to fill, something to read behind a login) and you have no browser_* tools. Say in `reason` what you want to do there. Once they allow it, the browser starts and the browser_* tools (browser_goto, browser_snapshot, browser_click, …) become available to you; begin with browser_goto.",
    inputSchema: z.object({
      reason: z
        .string()
        .min(1)
        .max(500)
        .describe("What you want to do in their browser, one sentence."),
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
          return "The person did not allow starting their browser. Do not ask again in this conversation; finish without it and say what you needed." as never;
        }
        // The resume lane started it already; make sure, and confirm.
        const status = await readUserBrowserStatus(input.identity);
        if (status.state === "absent") {
          await startUserBrowser(input.identity);
        }
        return "The person allowed it and their browser is running. Use the browser_* tools now, starting with browser_goto." as never;
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
        body: "A private browser for you in this Space — logins, cookies and downloads are yours; you can watch and take over any time from the monitor icon. Allow it to start?",
        choices: [
          {
            description: "Start my browser and let the Engenty use it.",
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
          browser: {
            space_id: input.identity.spaceId,
            start_request: true,
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
 * Resume lane, BEFORE the toolset is rebuilt: an "Allow" on the start card
 * creates the browser now, so the continuation's `createUserBrowserTools`
 * sees a stopped/running browser and attaches the full set instead of the
 * ask-tool again. Any other answer, or no browser identity, does nothing.
 */
export async function startUserBrowserOnResume(
  input: Pick<UserBrowserToolsInput, "browser" | "spaceId" | "tenantId">,
  resumeData: unknown
): Promise<void> {
  const choice =
    resumeData && typeof resumeData === "object"
      ? (resumeData as { choice_id?: unknown }).choice_id
      : undefined;
  if (choice !== BROWSER_ALLOW_START_CHOICE_ID) {
    return;
  }
  if (!(input.browser && input.spaceId)) {
    return;
  }
  const identity: UserBrowserIdentity = {
    spaceId: input.spaceId,
    tenantId: input.tenantId,
    userId: input.browser.userId,
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
  identity: UserBrowserIdentity;
  sandboxId: string;
  tool: {
    description: string;
    execute?: (inputData: unknown, ctx: unknown) => Promise<unknown>;
    inputSchema?: unknown;
  };
  unattended: boolean;
}) {
  const { identity, sandboxId } = params;
  return createTool({
    id: params.id,
    description: params.tool.description,
    inputSchema: params.tool.inputSchema as z.ZodTypeAny,
    execute: async (inputData, ctx) => {
      const runId = getEngentyToolsRunContext().runId?.trim() || "unknown";
      const audit = (value: Record<string, unknown>) =>
        params.emit?.(BROWSER_ACTION_EVENT_NAME, {
          input: redactForAudit(inputData),
          sandbox_id: sandboxId,
          tool: params.id,
          user_id: identity.userId,
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
              ? "The person is using their browser right now. Do not retry in a loop; wait for them to hand it back (browser_request_user) or continue without the browser."
              : "Another run is using this browser. Try again shortly or continue without it.",
        } as never;
      }
      markUserBrowserUsed(sandboxId);
      const startedAt = Date.now();
      const execute = params.tool.execute;
      if (!execute) {
        return { error: "tool_not_executable" } as never;
      }
      const run = async () => {
        const browser = getUserBrowser(identity);
        try {
          await browser.ensureReady();
        } catch {
          // Asleep (idle-stop), not yet reachable, or never created under
          // `autostart`: start it — the person declared this browser once,
          // or allowed agents to — then connect again.
          await startUserBrowser(identity);
          await getUserBrowser(identity).ensureReady();
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
        logger.warn("user browser tool failed", {
          message,
          sandboxId,
          tool: params.id,
        });
        releaseAgentSeat(sandboxId, runId);
        throw err;
      }
    },
  });
}

const INTERRUPTED = Symbol("interrupted_by_user");

/**
 * The browser toolset for a run (D11): the full wrapped set when the acting
 * user has a browser here (running or stopped) or allows agents to start one
 * (`autostart` — the wrapper's wake-on-first-use then creates it); only
 * `browser_start` (ask the person) when they have neither; `{}` with no
 * acting user or no space.
 */
export async function createUserBrowserTools(
  input: UserBrowserToolsInput
): Promise<Record<string, MastraToolDefinition>> {
  if (!(input.browser && input.spaceId)) {
    return {};
  }
  const identity: UserBrowserIdentity = {
    spaceId: input.spaceId,
    tenantId: input.tenantId,
    userId: input.browser.userId,
  };
  let status: Awaited<ReturnType<typeof readUserBrowserStatus>>;
  try {
    status = await readUserBrowserStatus(identity);
  } catch (err) {
    logger.warn("user browser status unavailable; no browser tools", {
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
  const sandboxId = buildUserBrowserSandboxId(identity);
  const tools: Record<string, MastraToolDefinition> = {};
  const browser = getUserBrowser(identity);
  for (const [id, tool] of Object.entries(browser.getTools())) {
    tools[id] = wrapBrowserTool({
      emit: input.emit,
      headless: input.headless,
      id,
      identity,
      sandboxId,
      tool: tool as unknown as Parameters<typeof wrapBrowserTool>[0]["tool"],
      unattended: input.browser.unattended,
    }) as unknown as MastraToolDefinition;
  }
  tools[BROWSER_REQUEST_USER_TOOL_ID] = createRequestUserTool({
    headless: input.headless,
    identity,
    sandboxId,
  }) as unknown as MastraToolDefinition;
  return tools;
}

/** Run end: the agent's seat goes with the run. */
export function releaseUserBrowserForRun(
  input: Pick<UserBrowserToolsInput, "browser" | "spaceId" | "tenantId">,
  runId: string
): void {
  if (!(input.browser && input.spaceId)) {
    return;
  }
  releaseAgentSeat(
    buildUserBrowserSandboxId({
      spaceId: input.spaceId,
      tenantId: input.tenantId,
      userId: input.browser.userId,
    }),
    runId
  );
}
