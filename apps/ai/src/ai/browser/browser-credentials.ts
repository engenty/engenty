// `browser_request_credentials`: the person types a login into the agent's
// page WITHOUT it passing through the agent (D: credentials never reach the
// model).
//
// The agent names the fields (refs from its snapshot) and parks the run on a
// card: a screenshot with the fields marked, the page's origin, and a form.
// What the person types is posted to `fillBrowserCredentials` — its own
// route, not the run's resume — and typed into the page there. The resume
// then carries only "filled" or "declined"; the tool tells the agent which
// fields were filled, never what.
//
// Guards, all server-side: the page must still be on the origin the card
// showed; a password goes only into an `<input type=password>`; the person
// holds the window's seat while their values go in; the request expires.
// Nothing here logs, stores or returns a value.

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
  markUserBrowserUsed,
} from "../sandbox/space-browser.js";
import { captureScreenshot } from "./browser-show-tool.js";
import {
  type BrowserWindowIdentity,
  browserWindowKey,
  ensureBrowserWindow,
  getUserBrowser,
  releaseUserSeat,
  takeUserSeat,
} from "./user-browser-registry.js";

export const BROWSER_REQUEST_CREDENTIALS_TOOL_ID =
  "browser_request_credentials";
export const CREDENTIALS_FILLED_CHOICE_ID = "browser_credentials_filled";
const DECLINE_CHOICE_ID = "browser_credentials_decline";

/** How long a card can be answered. */
const REQUEST_TTL_MS = 10 * 60 * 1000;

type FieldKind = "otp" | "password" | "text" | "username";

interface CredentialField {
  id: string;
  kind: FieldKind;
  label: string;
  ref: string;
}

interface PendingRequest {
  expiresAtMs: number;
  fields: CredentialField[];
  filled: string[] | null;
  identity: BrowserWindowIdentity;
  origin: string;
  submitRef: string | null;
}

/** Open requests by id; the latest per window, for the resume. */
const pending = new Map<string, PendingRequest>();
const latestByWindow = new Map<string, string>();

function dropExpired(now = Date.now()): void {
  for (const [id, request] of pending) {
    if (request.expiresAtMs < now) {
      pending.delete(id);
    }
  }
}

interface FillableLocator {
  click(): Promise<void>;
  evaluate<R>(fn: (el: Element) => R): Promise<R>;
  fill(value: string): Promise<void>;
}

interface WindowBrowser {
  getManagerForThread(): Promise<{ getPage(): { url(): string } }>;
  requireLocator(ref: string): Promise<FillableLocator | null>;
}

function originOf(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:"
      ? parsed.origin
      : null;
  } catch {
    return null;
  }
}

export type FillCredentialsError =
  | "expired"
  | "field_missing"
  | "fill_failed"
  | "not_found"
  | "not_a_password_field"
  | "not_an_input"
  | "origin_changed";

/**
 * Type the person's values into the page. The caller has checked they may
 * enter the Space; this checks the request is theirs to answer (same Space)
 * and still valid. Errors are codes — a Playwright message could quote the
 * value it failed to type.
 */
export async function fillBrowserCredentials(input: {
  requestId: string;
  spaceId: string;
  tenantId: string;
  values: Record<string, string>;
}): Promise<
  { filled: string[]; ok: true } | { error: FillCredentialsError; ok: false }
> {
  dropExpired();
  const request = pending.get(input.requestId);
  if (
    !request ||
    request.identity.spaceId !== input.spaceId ||
    request.identity.tenantId !== input.tenantId
  ) {
    return { error: "not_found", ok: false };
  }
  if (request.filled) {
    return { error: "expired", ok: false };
  }
  const identity = request.identity;
  const windowKey = browserWindowKey(identity);
  takeUserSeat(windowKey);
  try {
    await ensureBrowserWindow(identity);
    const browser = getUserBrowser(identity) as unknown as WindowBrowser;
    const page = (await browser.getManagerForThread()).getPage();
    if (originOf(page.url()) !== request.origin) {
      return { error: "origin_changed", ok: false };
    }
    const filled: string[] = [];
    for (const field of request.fields) {
      const value = input.values[field.id];
      if (typeof value !== "string" || value.length === 0) {
        continue;
      }
      const locator = await browser.requireLocator(field.ref).catch(() => null);
      if (!locator) {
        return { error: "field_missing", ok: false };
      }
      const element = await locator
        .evaluate((el) => ({
          tag: el.tagName,
          type: (el as HTMLInputElement).type ?? "",
        }))
        .catch(() => null);
      if (!element || (element.tag !== "INPUT" && element.tag !== "TEXTAREA")) {
        return { error: "not_an_input", ok: false };
      }
      if (field.kind === "password" && element.type !== "password") {
        return { error: "not_a_password_field", ok: false };
      }
      try {
        await locator.fill(value);
      } catch {
        return { error: "fill_failed", ok: false };
      }
      filled.push(field.label);
    }
    if (request.submitRef && filled.length > 0) {
      const submit = await browser
        .requireLocator(request.submitRef)
        .catch(() => null);
      await submit?.click().catch(() => undefined);
    }
    markUserBrowserUsed(buildUserBrowserSandboxId(identity));
    request.filled = filled;
    return { filled, ok: true };
  } catch {
    return { error: "fill_failed", ok: false };
  } finally {
    releaseUserSeat(windowKey);
  }
}

const fieldSchema = z.object({
  kind: z
    .enum(["username", "password", "otp", "text"])
    .describe("password only fills a password input."),
  label: z
    .string()
    .min(1)
    .max(60)
    .describe("What the person sees, e.g. Email."),
  ref: z.string().max(40).describe("The field's ref from browser_snapshot."),
});

const DESCRIPTION =
  "Ask the person to enter a login — username, password, one-time code — into fields on your current page, WITHOUT you seeing it. The chat shows a screenshot with the fields marked, the site's address, and a form; what they type goes straight into the page, never to you. Give each field's ref from your latest browser_snapshot, and `submit_ref` to press the sign-in button afterwards. WAITS for them. Never ask for a password or code in plain chat.";

export function createCredentialsRequestTool(input: {
  identity: BrowserWindowIdentity;
  lockKey: () => string;
}) {
  const windowKey = browserWindowKey(input.identity);
  return createTool({
    id: BROWSER_REQUEST_CREDENTIALS_TOOL_ID,
    description: DESCRIPTION,
    inputSchema: z.object({
      fields: z.array(fieldSchema).min(1).max(4),
      reason: z
        .string()
        .min(1)
        .max(300)
        .describe("Why you need the login, one sentence."),
      submit_ref: z
        .string()
        .max(40)
        .optional()
        .describe("Ref of the button to press once the fields are filled."),
    }),
    resumeSchema: requestDecisionResumeSchema,
    execute: async (inputData, ctx) => {
      const resume = ctx.agent?.resumeData as
        | z.infer<typeof requestDecisionResumeSchema>
        | undefined;
      const lockKey = input.lockKey();
      if (resume) {
        releaseFrontendToolSuspendSlot(lockKey);
        const requestId = latestByWindow.get(windowKey);
        const request = requestId ? pending.get(requestId) : undefined;
        if (requestId) {
          pending.delete(requestId);
          latestByWindow.delete(windowKey);
        }
        if (request?.filled && request.filled.length > 0) {
          return `The person entered ${request.filled.join(", ")} straight into the page${request.submitRef ? " and it was submitted" : ""}. You do not see what they typed, and must not try to read it back. Take a fresh browser_snapshot to see where the page is now.` as never;
        }
        return "The person did not enter the login. Do not ask for it again the same way; continue without it or say what you need." as never;
      }
      if (!getEngentyToolsRunContext().canSuspendForInteraction) {
        return {
          note: "Nobody is at the keyboard for this run; a login cannot be asked for. Finish without it and report what the person needs to do.",
          status: "needs_user",
        } as never;
      }
      const shot = await captureScreenshot(
        input.identity,
        inputData.fields.map((field) => ({
          color: "blue" as const,
          label: field.label,
          ref: field.ref,
          shape: "highlight" as const,
        }))
      );
      if (shot.unresolved.length > 0) {
        return {
          error: "fields_not_found",
          note: `These fields are not on the page (or scrolled out of view): ${shot.unresolved.join(", ")}. Take a fresh browser_snapshot and ask again with its refs.`,
        } as never;
      }
      const origin = originOf(shot.preview.url ?? "");
      if (!origin) {
        return {
          error: "no_site",
          note: "The page is not a web site (http/https); there is nothing to sign in to.",
        } as never;
      }
      dropExpired();
      const requestId = crypto.randomUUID();
      const fields = inputData.fields.map((field, index) => ({
        ...field,
        id: `field_${index + 1}`,
      }));
      pending.set(requestId, {
        expiresAtMs: Date.now() + REQUEST_TTL_MS,
        fields,
        filled: null,
        identity: input.identity,
        origin,
        submitRef: inputData.submit_ref ?? null,
      });
      latestByWindow.set(windowKey, requestId);
      const artifact = createRequestDecisionArtifact({
        choices: [
          {
            description: "Continue without signing in.",
            id: DECLINE_CHOICE_ID,
            label: "Not now",
          },
        ],
        title: inputData.reason,
      });
      const ticket = await acquireFrontendToolSuspendSlot(lockKey);
      try {
        await ctx.agent?.suspend({
          ...artifact,
          preview: {
            agent_id: input.identity.agentId,
            fields: fields.map(({ id, kind, label }) => ({ id, kind, label })),
            filled_choice_id: CREDENTIALS_FILLED_CHOICE_ID,
            kind: "browser_credentials",
            origin,
            request_id: requestId,
            screenshot: {
              annotations: shot.preview.annotations,
              height: shot.preview.height,
              image: shot.preview.image,
              width: shot.preview.width,
            },
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

/** Tests only. */
export function resetBrowserCredentialsForTests(): void {
  pending.clear();
  latestByWindow.clear();
}
