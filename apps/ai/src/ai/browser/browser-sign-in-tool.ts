// `browser_sign_in`: a CLI on the Space computer signs in through the person
// (the architecture review's D).
//
// `acme login` prints a URL and waits on 127.0.0.1:<port>; the computer has
// no browser, and the person's own browser cannot reach that port. The bot
// runs the login in the background and calls this tool with the URL: the
// URL opens in its window of the Space browser, the controls go to the person
// and the run parks on a decision card, like `browser_request_user`. The
// callback the sign-in redirects to is forwarded into the computer
// (`loopback-forward.ts`). A device-code login needs no forward — the code
// is shown on the card.
//
// The login lands where the CLI keeps it — a dotfile in $HOME on the Space
// drive, shared by the Space's agents like the browser's own logins.

import { createRequestDecisionArtifact } from "@engenty/ai-core";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import {
  acquireFrontendToolSuspendSlot,
  releaseFrontendToolSuspendSlot,
} from "../../../ai/frontend-tools/frontend-tool-suspend-lock.js";
import { getEngentyToolsRunContext } from "../../../ai/tools/engenty-tools/lib/run-context.js";
import { requestDecisionResumeSchema } from "../../../ai/tools/request-decision/native-request-decision.js";
import {
  buildUserBrowserSandboxId,
  startUserBrowser,
} from "../sandbox/space-browser.js";
import { execInSpaceComputer } from "../sandbox/space-computer.js";
import {
  armLoopbackForward,
  type ForwardResult,
  loopbackCallbackPort,
  type SignInPage,
} from "./loopback-forward.js";
import {
  acquireAgentSeat,
  type BrowserWindowIdentity,
  ensureBrowserWindow,
  getUserBrowser,
  releaseUserSeat,
  takeUserSeat,
} from "./user-browser-registry.js";

export const BROWSER_SIGN_IN_TOOL_ID = "browser_sign_in";

const DONE_CHOICE_ID = "browser_sign_in_done";
const DECLINE_CHOICE_ID = "browser_sign_in_decline";
/** The CLI's reply is a short "you are logged in" page. */
const MAX_REPLY_BYTES = 1024 * 1024;
const FORWARD_TIMEOUT_MS = 30_000;

/** The sign-in waiting in each window, until the card is answered. */
const pending = new Map<
  string,
  { port: number } & ReturnType<typeof armLoopbackForward>
>();

/** Replay the callback with `curl` inside the Space's computer. */
function forwardIntoComputer(identity: BrowserWindowIdentity) {
  return async (url: string): Promise<ForwardResult> => {
    const result = await execInSpaceComputer(
      identity,
      [
        "curl",
        "-sS",
        "--globoff",
        "--max-redirs",
        "0",
        "--max-time",
        "20",
        "--max-filesize",
        String(MAX_REPLY_BYTES),
        "--write-out",
        "\n%{http_code}",
        url,
      ],
      { maxBuffer: 2 * MAX_REPLY_BYTES, timeoutMs: FORWARD_TIMEOUT_MS }
    );
    if (!result) {
      return {
        error: "This Space's computer is not running.",
        status: null,
        text: "",
      };
    }
    const cut = result.stdout.lastIndexOf("\n");
    const status = Number.parseInt(result.stdout.slice(cut + 1), 10);
    if (result.exitCode !== 0 || !status) {
      return {
        error:
          result.stderr.trim() ||
          "Nothing answered on that port in the computer.",
        status: null,
        text: "",
      };
    }
    return { status, text: result.stdout.slice(0, Math.max(cut, 0)) };
  };
}

function isDeclined(resume: z.infer<typeof requestDecisionResumeSchema>) {
  return (
    resume.cancelled === true ||
    resume.choice_id === DECLINE_CHOICE_ID ||
    (resume.choices ?? []).some((c) => c.id === DECLINE_CHOICE_ID)
  );
}

export function createSignInTool(input: {
  audit: (value: Record<string, unknown>) => void;
  headless: boolean;
  identity: BrowserWindowIdentity;
  lockKey: () => string;
  windowKey: string;
}) {
  const { identity, windowKey } = input;
  return createTool({
    id: BROWSER_SIGN_IN_TOOL_ID,
    description:
      "Let the person complete a command-line sign-in on this Space's computer. For a CLI that logs in through a browser (`<cli> login` prints a URL and waits for a callback on 127.0.0.1): start the command with background: true, read the URL from its output, and call this with it — the URL opens in your browser window with the controls the person's, and the callback reaches the waiting CLI. For a device-code login, pass the code as `code`. WAITS until the person answers; then check with the CLI (its whoami/status command) before you continue.",
    inputSchema: z.object({
      callback_port: z
        .number()
        .int()
        .min(1024)
        .max(65_535)
        .optional()
        .describe(
          "The port the CLI listens on, when the URL does not name it in a 127.0.0.1 redirect."
        ),
      code: z
        .string()
        .max(64)
        .optional()
        .describe("A device code the person must enter on the page."),
      reason: z
        .string()
        .min(1)
        .max(200)
        .describe("What they sign in to, e.g. 'Sign in to Acme'."),
      url: z.string().url().describe("The sign-in URL the CLI printed."),
    }),
    resumeSchema: requestDecisionResumeSchema,
    execute: async (inputData, ctx) => {
      const resume = ctx.agent?.resumeData as
        | z.infer<typeof requestDecisionResumeSchema>
        | undefined;
      const lockKey = input.lockKey();
      if (resume) {
        releaseFrontendToolSuspendSlot(lockKey);
        releaseUserSeat(windowKey);
        const waiting = pending.get(windowKey);
        pending.delete(windowKey);
        const outcome = (await waiting?.settle()) ?? null;
        const declined = isDeclined(resume);
        input.audit({
          callback: outcome,
          declined,
          ok: !declined,
          phase: "answered",
        });
        if (declined) {
          return "The person declined to sign in. Do not ask again for the same sign-in; stop the waiting login command and say what it was for." as never;
        }
        if (!waiting) {
          return {
            note: "The person says they are done. Check with the CLI (its whoami/status command) that it is signed in before you continue.",
            status: "done",
          } as never;
        }
        if (!outcome) {
          return {
            note: `No callback reached 127.0.0.1:${waiting.port} on the computer. Check whether the CLI is signed in; if not, check that the login command is still running and call browser_sign_in again with the URL it prints now.`,
            status: "no_callback",
          } as never;
        }
        if (!outcome.delivered) {
          return {
            error: outcome.error,
            note: "The callback did not reach the CLI — it may have stopped waiting. Run the login again with background: true and call browser_sign_in with the new URL.",
            status: "callback_failed",
          } as never;
        }
        return {
          note: "The CLI on the Space's computer got the sign-in. Check with the CLI (its whoami/status command) before you continue.",
          status: "signed_in",
        } as never;
      }

      if (
        input.headless ||
        !getEngentyToolsRunContext().canSuspendForInteraction
      ) {
        return {
          note: "Nobody is at the keyboard for this run, so nobody can sign in. Stop the waiting login command and report what needs a sign-in.",
          reason: "no_human_channel",
          status: "needs_user",
        } as never;
      }
      const url = new URL(inputData.url);
      if (url.protocol !== "https:" && url.protocol !== "http:") {
        return { error: "url must be http(s)" } as never;
      }
      const port = inputData.callback_port ?? loopbackCallbackPort(url.href);
      if (!(port || inputData.code)) {
        return {
          error: "no_callback",
          note: "This URL names no 127.0.0.1 callback. Pass the port the CLI listens on as callback_port, or the device code it printed as code.",
        } as never;
      }
      const runId = getEngentyToolsRunContext().runId?.trim() || "unknown";
      const seat = acquireAgentSeat(identity, runId);
      if (!seat.ok) {
        return {
          error: seat.error,
          note: "Your browser window is in use. Wait for it and call browser_sign_in again.",
        } as never;
      }
      try {
        await ensureBrowserWindow(identity);
      } catch {
        await startUserBrowser(identity);
        await ensureBrowserWindow(identity);
      }
      const page = await (
        getUserBrowser(identity) as unknown as {
          getPage(): Promise<
            SignInPage & { goto(url: string, o: object): Promise<unknown> }
          >;
        }
      ).getPage();
      // A new sign-in replaces one the person never answered.
      pending.get(windowKey)?.disarm();
      pending.delete(windowKey);
      if (port) {
        const forward = armLoopbackForward({
          forward: forwardIntoComputer(identity),
          page,
          port,
        });
        pending.set(windowKey, { port, ...forward });
      }
      // A page that is slow or fails to load is still the person's to fix.
      await page
        .goto(url.href, { timeout: 30_000, waitUntil: "domcontentloaded" })
        .catch(() => undefined);
      takeUserSeat(windowKey);
      input.audit({
        callback_port: port ?? null,
        code: Boolean(inputData.code),
        host: url.host,
        ok: true,
        phase: "opened",
      });
      const artifact = createRequestDecisionArtifact({
        body: inputData.code
          ? `The sign-in page is open in the agent's browser window and the controls are yours. Enter the code ${inputData.code} there, then answer here.`
          : "The sign-in page is open in the agent's browser window and the controls are yours. Sign in there, then answer here — the login goes to the CLI on this Space's computer.",
        choices: [
          {
            description: "I signed in; continue.",
            id: DONE_CHOICE_ID,
            label: "Done",
          },
          {
            description: "Continue without signing in.",
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
            agent_id: identity.agentId,
            sandbox_id: buildUserBrowserSandboxId(identity),
            space_id: identity.spaceId,
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
