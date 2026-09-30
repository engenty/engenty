// `browser_show`: the agent puts its browser window into the chat — the live
// view (the person watches, and can take over), the browser's setup (state,
// Start, the Space's switches), or a screenshot with the agent's marks on it
// to make a point. With a `question` it asks about what it shows and WAITS,
// on the decision card the chat already knows, the view drawn beside it.
//
// The screenshot goes to the chat, not to the model: the agent chose the
// marks, it needs no picture of them (`toModelOutput`).

import type {
  AgUiBrowserAnnotation,
  AgUiBrowserPreview,
} from "@engenty/ag-ui-bridge";
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
  startUserBrowser,
} from "../sandbox/space-browser.js";
import {
  type BrowserWindowIdentity,
  ensureBrowserWindow,
  getUserBrowser,
} from "./user-browser-registry.js";

export const BROWSER_SHOW_TOOL_ID = "browser_show";

/** A screenshot as the chat keeps it: small enough to live in the transcript. */
const SCREENSHOT_JPEG_QUALITY = 70;
/** Page kept above and below the marks when the frame is cropped to them. */
const CROP_MARGIN_PX = 160;
/** A frame is never taller than this share of its width (a tall pane's page is mostly blank). */
const MAX_HEIGHT_RATIO = 0.75;
/** A band around marks is grown to at least this share of the width. */
const MIN_HEIGHT_RATIO = 0.45;

/**
 * The part of the viewport worth showing: the full width, and in height the
 * band around the marks — or the top of the page without marks — at most
 * `MAX_HEIGHT_RATIO` of the width unless the marks themselves need more.
 */
export function screenshotClip(
  viewport: { height: number; width: number },
  marks: readonly { height: number; y: number }[]
): { height: number; width: number; x: number; y: number } {
  const maxHeight = Math.round(viewport.width * MAX_HEIGHT_RATIO);
  if (marks.length === 0) {
    return {
      height: Math.min(viewport.height, maxHeight),
      width: viewport.width,
      x: 0,
      y: 0,
    };
  }
  const top = Math.min(...marks.map((mark) => mark.y));
  const bottom = Math.max(...marks.map((mark) => mark.y + mark.height));
  let y = Math.max(0, top - CROP_MARGIN_PX);
  let end = Math.min(viewport.height, bottom + CROP_MARGIN_PX);
  // Grow a thin band to a readable frame, around the marks.
  const minHeight = Math.min(
    viewport.height,
    Math.round(viewport.width * MIN_HEIGHT_RATIO)
  );
  if (end - y < minHeight) {
    const grow = minHeight - (end - y);
    y = Math.max(0, y - Math.floor(grow / 2));
    end = Math.min(viewport.height, y + minHeight);
    y = Math.max(0, end - minHeight);
  }
  return { height: end - y, width: viewport.width, x: 0, y };
}

const annotationSchema = z.object({
  box: z
    .object({
      height: z.number(),
      width: z.number(),
      x: z.number(),
      y: z.number(),
    })
    .optional()
    .describe(
      "Area in the page's viewport, CSS pixels — only when there is no ref."
    ),
  color: z.enum(["red", "amber", "green", "blue"]).optional(),
  label: z
    .string()
    .max(80)
    .optional()
    .describe("Short text drawn next to the mark."),
  ref: z
    .string()
    .max(40)
    .optional()
    .describe("Element ref from your latest browser_snapshot, e.g. e12."),
  shape: z.enum(["box", "circle", "arrow", "highlight"]).optional(),
});

const inputSchema = z.object({
  annotations: z
    .array(annotationSchema)
    .max(12)
    .optional()
    .describe("Screenshot only: marks to draw, each on a ref or a box."),
  caption: z
    .string()
    .max(300)
    .optional()
    .describe("One sentence under the view: what the person is looking at."),
  choices: z
    .array(
      z.object({
        description: z.string().max(200).optional(),
        id: z.string().regex(/^[a-z0-9_]{1,40}$/),
        label: z.string().min(1).max(80),
      })
    )
    .min(2)
    .max(6)
    .optional()
    .describe("With a question: the answers to offer (default Yes / No)."),
  question: z
    .string()
    .max(300)
    .optional()
    .describe("Ask about what you show and wait for the answer."),
  view: z.enum(["live", "screenshot", "setup"]),
});

type Input = z.infer<typeof inputSchema>;

const DESCRIPTION =
  'Show your browser window to the person, in the chat. `view: "screenshot"` shows the page now, with your `annotations` drawn on it (box / circle / arrow / highlight on an element ref from browser_snapshot, with a short label) — use it to point at something, explain a page, or show a result. `view: "live"` embeds the live window (they watch and can take over). `view: "setup"` shows the browser\'s state, a Start button and the Space\'s browser switches — when the browser is stopped, or they want to change what agents may do with it. Add `question` (and `choices`) to ask about what you show and WAIT for the answer. You do not get the image back; you already know what you marked.';

function toPreviewAnnotation(
  input: NonNullable<Input["annotations"]>[number],
  box: { height: number; width: number; x: number; y: number }
): AgUiBrowserAnnotation {
  return {
    color: input.color ?? "red",
    height: Math.round(box.height),
    ...(input.label ? { label: input.label } : {}),
    shape: input.shape ?? "box",
    width: Math.round(box.width),
    x: Math.round(box.x),
    y: Math.round(box.y),
  };
}

interface Locatable {
  boundingBox(): Promise<{
    height: number;
    width: number;
    x: number;
    y: number;
  } | null>;
}

/**
 * The window's page now, as a JPEG with the marks resolved to viewport
 * boxes. A ref that no longer resolves (stale snapshot, element off-screen)
 * is reported back instead of drawn somewhere wrong.
 */
export async function captureScreenshot(
  identity: BrowserWindowIdentity,
  annotations: NonNullable<Input["annotations"]>
): Promise<{
  preview: Extract<AgUiBrowserPreview, { kind: "browser_screenshot" }>;
  unresolved: string[];
}> {
  try {
    await ensureBrowserWindow(identity);
  } catch {
    // Asleep: this tool only exists where the browser was declared once.
    await startUserBrowser(identity);
    await ensureBrowserWindow(identity);
  }
  markUserBrowserUsed(buildUserBrowserSandboxId(identity));
  const browser = getUserBrowser(identity) as unknown as {
    getManagerForThread(): Promise<{
      getPage(): {
        screenshot(options: {
          clip: { height: number; width: number; x: number; y: number };
          quality: number;
          type: "jpeg";
        }): Promise<Buffer>;
        title(): Promise<string>;
        url(): string;
        viewportSize(): { height: number; width: number } | null;
      };
    }>;
    requireLocator(ref: string): Promise<Locatable | null>;
  };
  const page = (await browser.getManagerForThread()).getPage();
  const viewport = page.viewportSize() ?? { height: 900, width: 1440 };
  const marks: AgUiBrowserAnnotation[] = [];
  const unresolved: string[] = [];
  for (const annotation of annotations) {
    let box = annotation.box ?? null;
    if (annotation.ref) {
      const locator = await browser
        .requireLocator(annotation.ref)
        .catch(() => null);
      box = locator ? await locator.boundingBox().catch(() => null) : null;
    }
    // Scrolled out of view: nothing on the frame to draw it on.
    const visible =
      box && box.y < viewport.height && box.y + box.height > 0 && box.width > 0;
    if (box && visible) {
      marks.push(toPreviewAnnotation(annotation, box));
    } else {
      unresolved.push(annotation.ref ?? annotation.label ?? "box");
    }
  }
  const clip = screenshotClip(viewport, marks);
  const image = await page.screenshot({
    clip,
    quality: SCREENSHOT_JPEG_QUALITY,
    type: "jpeg",
  });
  const title = await page.title().catch(() => "");
  return {
    preview: {
      agent_id: identity.agentId,
      annotations: marks.map((mark) => ({ ...mark, y: mark.y - clip.y })),
      height: clip.height,
      image: `data:image/jpeg;base64,${Buffer.from(image).toString("base64")}`,
      kind: "browser_screenshot",
      space_id: identity.spaceId,
      ...(title ? { title } : {}),
      url: page.url(),
      width: clip.width,
    },
    unresolved,
  };
}

interface ShowOutput {
  browser_view: AgUiBrowserPreview;
  caption?: string;
  /** A question that was not asked because marks were missing. */
  question_not_asked?: boolean;
  unresolved?: string[];
}

function describeForModel(output: unknown): string {
  const shown = output as Partial<ShowOutput> | string | undefined;
  if (typeof shown === "string") {
    return shown;
  }
  const view = shown?.browser_view;
  if (!view) {
    return JSON.stringify(output ?? null);
  }
  if (view.kind === "browser_screenshot") {
    const missing = shown?.unresolved?.length
      ? ` These marks could not be placed (element not found, or scrolled out of view — scroll to it or take a fresh browser_snapshot): ${shown.unresolved.join(", ")}.`
      : "";
    const notAsked = shown?.question_not_asked
      ? " Your question was NOT asked; fix the marks and call browser_show again."
      : "";
    return `Shown to the person in the chat: a screenshot of ${view.url ?? "the page"} with ${view.annotations.length} mark(s).${missing}${notAsked}`;
  }
  if (view.kind === "browser" && view.mode === "live") {
    return "Shown to the person in the chat: your live browser window. They can watch and take over.";
  }
  return "Shown to the person in the chat: the browser's state, Start, and the Space's browser switches.";
}

export function createBrowserShowTool(input: {
  identity: BrowserWindowIdentity;
  lockKey: () => string;
}) {
  return createTool({
    id: BROWSER_SHOW_TOOL_ID,
    description: DESCRIPTION,
    inputSchema,
    resumeSchema: requestDecisionResumeSchema,
    execute: async (inputData, ctx) => {
      const resume = ctx.agent?.resumeData as
        | z.infer<typeof requestDecisionResumeSchema>
        | undefined;
      const lockKey = input.lockKey();
      if (resume) {
        releaseFrontendToolSuspendSlot(lockKey);
        if (resume.cancelled === true) {
          return "The person closed the question without answering. Do not ask it again the same way." as never;
        }
        const answer =
          resume.choice_label ??
          resume.choices?.map((choice) => choice.label).join(", ") ??
          resume.text;
        return {
          answer: answer ?? null,
          choice_id: resume.choice_id ?? null,
        } as never;
      }
      let preview: AgUiBrowserPreview;
      let unresolved: string[] = [];
      if (inputData.view === "screenshot") {
        const shot = await captureScreenshot(
          input.identity,
          inputData.annotations ?? []
        );
        preview = shot.preview;
        unresolved = shot.unresolved;
      } else {
        preview = {
          agent_id: input.identity.agentId,
          kind: "browser",
          mode: inputData.view,
          space_id: input.identity.spaceId,
        };
      }
      // A question about marks that are not there would ask about nothing:
      // hand the misses back first (`describeForModel`) and let it retry.
      if (
        inputData.question &&
        unresolved.length === 0 &&
        getEngentyToolsRunContext().canSuspendForInteraction
      ) {
        const artifact = createRequestDecisionArtifact({
          ...(inputData.caption ? { body: inputData.caption } : {}),
          choices: inputData.choices ?? [
            { id: "yes", label: "Yes" },
            { id: "no", label: "No" },
          ],
          title: inputData.question,
        });
        const ticket = await acquireFrontendToolSuspendSlot(lockKey);
        try {
          await ctx.agent?.suspend({ ...artifact, preview });
          releaseFrontendToolSuspendSlot(lockKey, ticket);
        } catch (error) {
          releaseFrontendToolSuspendSlot(lockKey, ticket);
          throw error;
        }
        return undefined as never;
      }
      const output: ShowOutput = {
        browser_view: preview,
        ...(inputData.caption ? { caption: inputData.caption } : {}),
        ...(unresolved.length ? { unresolved } : {}),
        ...(inputData.question && unresolved.length
          ? { question_not_asked: true }
          : {}),
      };
      return output as never;
    },
    toModelOutput: (output: unknown) => ({
      type: "text" as const,
      value: describeForModel(output),
    }),
  });
}
