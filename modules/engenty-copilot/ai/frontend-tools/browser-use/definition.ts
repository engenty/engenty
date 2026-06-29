import { defineFrontendToolSpec } from "@engenty/ag-ui-bridge";
import { z } from "zod";

/* -------------------------------------------------------------------------- */
/*  browser_screenshot                                                        */
/* -------------------------------------------------------------------------- */

export const BROWSER_SCREENSHOT_SPEC = defineFrontendToolSpec({
  availability: "enabled",
  description:
    "Capture a text description of the current browser viewport. Returns visible headings, buttons, links, form fields and their values. Use this to understand what the user currently sees.",
  name: "browser_screenshot",
  safety: "safe",
  schema: z.object({}),
  title: "Browser Screenshot",
});

/* -------------------------------------------------------------------------- */
/*  browser_dom_snapshot                                                       */
/* -------------------------------------------------------------------------- */

export const BROWSER_DOM_SNAPSHOT_SPEC = defineFrontendToolSpec({
  availability: "enabled",
  description:
    "Capture a pruned DOM snapshot of interactive elements on the page. Returns a list of elements with their tag, text, CSS selector, type, value, and bounding position. Use this to find elements before clicking, focusing, or typing.",
  name: "browser_dom_snapshot",
  safety: "safe",
  schema: z.object({
    root_selector: z
      .string()
      .optional()
      .describe(
        "Optional CSS selector to scope the snapshot. Defaults to document.body."
      ),
  }),
  title: "DOM Snapshot",
});

/* -------------------------------------------------------------------------- */
/*  browser_scroll                                                             */
/* -------------------------------------------------------------------------- */

export const BROWSER_SCROLL_SPEC = defineFrontendToolSpec({
  availability: "enabled",
  description:
    "Scroll the page smoothly. Provide exactly one of: 'to' (absolute Y in px), 'by' (relative Y offset in px, positive = down), or 'to_selector' (CSS selector to scroll into view).",
  name: "browser_scroll",
  safety: "safe",
  schema: z.object({
    to: z.number().optional().describe("Absolute Y position in pixels."),
    by: z
      .number()
      .optional()
      .describe("Relative Y offset in pixels. Positive scrolls down."),
    to_selector: z
      .string()
      .optional()
      .describe("CSS selector of an element to scroll into view."),
  }),
  title: "Scroll Page",
});

/* -------------------------------------------------------------------------- */
/*  browser_click                                                              */
/* -------------------------------------------------------------------------- */

export const BROWSER_CLICK_SPEC = defineFrontendToolSpec({
  availability: "enabled",
  description:
    "Click an element on the page. Provide either a CSS 'selector' or x/y coordinates. Prefer selector when available.",
  name: "browser_click",
  safety: "safe",
  schema: z.object({
    selector: z
      .string()
      .optional()
      .describe("CSS selector of the element to click."),
    x: z
      .number()
      .optional()
      .describe("X coordinate (viewport-relative) to click."),
    y: z
      .number()
      .optional()
      .describe("Y coordinate (viewport-relative) to click."),
  }),
  title: "Click Element",
});

/* -------------------------------------------------------------------------- */
/*  browser_hover                                                              */
/* -------------------------------------------------------------------------- */

export const BROWSER_HOVER_SPEC = defineFrontendToolSpec({
  availability: "enabled",
  description:
    "Hover over an element on the page (triggers pointerenter/mouseover). Provide either a CSS 'selector' or x/y coordinates.",
  name: "browser_hover",
  safety: "safe",
  schema: z.object({
    selector: z
      .string()
      .optional()
      .describe("CSS selector of the element to hover."),
    x: z
      .number()
      .optional()
      .describe("X coordinate (viewport-relative) to hover."),
    y: z
      .number()
      .optional()
      .describe("Y coordinate (viewport-relative) to hover."),
  }),
  title: "Hover Element",
});

/* -------------------------------------------------------------------------- */
/*  browser_focus                                                              */
/* -------------------------------------------------------------------------- */

export const BROWSER_FOCUS_SPEC = defineFrontendToolSpec({
  availability: "enabled",
  description:
    "Focus an element on the page via CSS selector. The element will receive keyboard focus.",
  name: "browser_focus",
  safety: "safe",
  schema: z.object({
    selector: z.string().describe("CSS selector of the element to focus."),
  }),
  title: "Focus Element",
});

/* -------------------------------------------------------------------------- */
/*  browser_input                                                              */
/* -------------------------------------------------------------------------- */

export const BROWSER_INPUT_SPEC = defineFrontendToolSpec({
  availability: "enabled",
  description:
    "Type text into a form field (input, textarea, or contenteditable). Dispatches React-compatible input events so frameworks pick up the change.",
  name: "browser_input",
  safety: "safe",
  schema: z.object({
    selector: z
      .string()
      .describe("CSS selector of the input/textarea/contenteditable element."),
    value: z.string().describe("The text value to set."),
    append: z
      .boolean()
      .optional()
      .describe("If true, appends to the existing value instead of replacing."),
  }),
  title: "Input Text",
});
