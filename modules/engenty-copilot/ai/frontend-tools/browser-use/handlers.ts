/**
 * Pure handler functions for browser-use frontend tools.
 * No React dependencies — these are vanilla DOM operations.
 */

import type { JsonValue } from "@engenty/ag-ui-bridge";

/* ========================================================================== */
/*  Helpers                                                                    */
/* ========================================================================== */

function resolveElement(input: {
  selector?: string;
  x?: number;
  y?: number;
}): Element | null {
  if (input.selector) {
    return document.querySelector(input.selector);
  }
  if (input.x != null && input.y != null) {
    return document.elementFromPoint(input.x, input.y);
  }
  return null;
}

function isVisible(el: Element): boolean {
  const style = window.getComputedStyle(el);
  return (
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    style.opacity !== "0" &&
    el.getBoundingClientRect().height > 0
  );
}

function truncate(str: string, maxLen: number): string {
  const trimmed = str.trim().replace(/\s+/g, " ");
  return trimmed.length > maxLen ? `${trimmed.slice(0, maxLen)}…` : trimmed;
}

function cssSelector(el: Element): string {
  // Try ID first
  if (el.id) {
    return `#${CSS.escape(el.id)}`;
  }
  // Try data-testid
  const testId = el.getAttribute("data-testid");
  if (testId) {
    return `[data-testid="${CSS.escape(testId)}"]`;
  }
  // Try aria-label
  const ariaLabel = el.getAttribute("aria-label");
  if (ariaLabel) {
    return `${el.tagName.toLowerCase()}[aria-label="${CSS.escape(ariaLabel)}"]`;
  }
  // Try name attribute
  const name = el.getAttribute("name");
  if (name) {
    return `${el.tagName.toLowerCase()}[name="${CSS.escape(name)}"]`;
  }
  // Build a path-based selector (tag + nth-child)
  const path: string[] = [];
  let current: Element | null = el;
  while (current && current !== document.body) {
    let segment = current.tagName.toLowerCase();
    const parent: Element | null = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(
        (c: Element) => c.tagName === current!.tagName
      );
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        segment += `:nth-of-type(${index})`;
      }
    }
    path.unshift(segment);
    current = parent;
  }
  return path.join(" > ");
}

/* ========================================================================== */
/*  ui_screenshot                                                         */
/* ========================================================================== */

interface ScreenshotEntry {
  role?: string;
  selector?: string;
  tag: string;
  text: string;
}

export function handleBrowserScreenshot(): JsonValue {
  const entries: ScreenshotEntry[] = [];
  const TAGS =
    "h1,h2,h3,h4,h5,h6,p,a,button,input,textarea,select,label,img,nav,header,footer,main,section,article,[role='button'],[role='link'],[role='tab'],[role='menuitem']";

  const elements = document.querySelectorAll(TAGS);
  const seen = new Set<string>();

  for (const el of elements) {
    if (!isVisible(el)) {
      continue;
    }
    const tag = el.tagName.toLowerCase();
    let text = "";

    if (tag === "input" || tag === "textarea") {
      const inp = el as HTMLInputElement | HTMLTextAreaElement;
      const label =
        el.getAttribute("aria-label") ||
        el.getAttribute("placeholder") ||
        el.getAttribute("name") ||
        "";
      text = label ? `[${label}]` : "";
      if (inp.value) {
        text += ` = "${truncate(inp.value, 60)}"`;
      }
      if (inp.type) {
        text += ` (${inp.type})`;
      }
    } else if (tag === "select") {
      const sel = el as HTMLSelectElement;
      text =
        sel.selectedOptions[0]?.textContent?.trim() ||
        el.getAttribute("aria-label") ||
        "";
    } else if (tag === "img") {
      text = el.getAttribute("alt") || el.getAttribute("title") || "[image]";
    } else {
      text = truncate(el.textContent || "", 100);
    }

    if (!text) {
      continue;
    }
    const key = `${tag}:${text}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    const entry: ScreenshotEntry = { tag, text };
    const role = el.getAttribute("role");
    if (role) {
      entry.role = role;
    }
    entries.push(entry);

    if (entries.length >= 150) {
      break;
    }
  }

  return {
    title: document.title,
    url: window.location.pathname,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      scrollY: Math.round(window.scrollY),
      scrollHeight: document.documentElement.scrollHeight,
    },
    element_count: entries.length,
    elements: entries as unknown as JsonValue,
  };
}

/* ========================================================================== */
/*  ui_dom_snapshot                                                        */
/* ========================================================================== */

interface DomSnapshotEntry {
  placeholder?: string;
  rect?: { x: number; y: number; w: number; h: number };
  role?: string;
  selector: string;
  tag: string;
  text?: string;
  type?: string;
  value?: string;
}

export function handleBrowserDomSnapshot(input: {
  root_selector?: string;
}): JsonValue {
  const root = input.root_selector
    ? document.querySelector(input.root_selector)
    : document.body;
  if (!root) {
    throw new Error(`Root element not found: ${input.root_selector ?? "body"}`);
  }

  const INTERACTIVE =
    "a,button,input,textarea,select,details,summary,[role='button'],[role='link'],[role='tab'],[role='menuitem'],[role='checkbox'],[role='radio'],[role='switch'],[role='combobox'],[contenteditable='true']";

  const elements = root.querySelectorAll(INTERACTIVE);
  const entries: DomSnapshotEntry[] = [];

  for (const el of elements) {
    if (!isVisible(el)) {
      continue;
    }
    const tag = el.tagName.toLowerCase();
    const rect = el.getBoundingClientRect();

    const entry: DomSnapshotEntry = {
      tag,
      selector: cssSelector(el),
    };

    // Text content (short)
    const text = truncate(el.textContent || "", 80);
    if (text) {
      entry.text = text;
    }

    // Input-specific
    if (tag === "input" || tag === "textarea") {
      const inp = el as HTMLInputElement | HTMLTextAreaElement;
      if (inp.type) {
        entry.type = inp.type;
      }
      if (inp.value) {
        entry.value = truncate(inp.value, 60);
      }
      if (inp.placeholder) {
        entry.placeholder = inp.placeholder;
      }
    }

    // Role
    const role = el.getAttribute("role");
    if (role) {
      entry.role = role;
    }

    // Position
    entry.rect = {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      w: Math.round(rect.width),
      h: Math.round(rect.height),
    };

    entries.push(entry);
    if (entries.length >= 200) {
      break;
    }
  }

  return {
    url: window.location.pathname,
    root: input.root_selector ?? "body",
    element_count: entries.length,
    elements: entries as unknown as JsonValue,
  };
}

/* ========================================================================== */
/*  ui_scroll                                                             */
/* ========================================================================== */

/**
 * Walk up from `start` to find the nearest scrollable ancestor. The app uses a
 * fixed-frame layout where `<main>` and wrapper divs have `overflow: hidden` —
 * the actual scrollable container is often a child `div` inside the page.
 */
function findScrollableContainer(start?: Element | null): Element | Window {
  // 1. Walk up from the given element looking for an actually-scrollable ancestor
  let el: Element | null = start ?? null;
  while (el && el !== document.documentElement) {
    const style = window.getComputedStyle(el);
    const overflowY = style.overflowY;
    if (
      (overflowY === "auto" || overflowY === "scroll") &&
      el.scrollHeight > el.clientHeight
    ) {
      return el;
    }
    el = el.parentElement;
  }

  // 2. Try the app's main content area — it or its first scrollable child
  const main = document.getElementById("engenty-app-main");
  if (main) {
    // Check the main element itself
    const mainStyle = window.getComputedStyle(main);
    if (
      (mainStyle.overflowY === "auto" || mainStyle.overflowY === "scroll") &&
      main.scrollHeight > main.clientHeight
    ) {
      return main;
    }
    // Check direct children for scrollable containers
    for (const child of main.children) {
      const childStyle = window.getComputedStyle(child);
      if (
        (childStyle.overflowY === "auto" ||
          childStyle.overflowY === "scroll") &&
        child.scrollHeight > child.clientHeight
      ) {
        return child;
      }
    }
  }

  // 3. Scan all elements with overflow-y: auto/scroll (broader fallback)
  const candidates = document.querySelectorAll("*");
  for (const candidate of candidates) {
    const style = window.getComputedStyle(candidate);
    if (
      (style.overflowY === "auto" || style.overflowY === "scroll") &&
      candidate.scrollHeight > candidate.clientHeight &&
      candidate.clientHeight > 100 // Ignore tiny scroll areas
    ) {
      return candidate;
    }
  }

  // 4. Fallback to window
  return window;
}

function getScrollInfo(container: Element | Window): {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
} {
  if (container instanceof Window) {
    return {
      scrollTop: window.scrollY,
      scrollHeight: document.documentElement.scrollHeight,
      clientHeight: window.innerHeight,
    };
  }
  return {
    scrollTop: container.scrollTop,
    scrollHeight: container.scrollHeight,
    clientHeight: container.clientHeight,
  };
}

export function handleBrowserScroll(input: {
  to?: number;
  by?: number;
  to_selector?: string;
}): JsonValue {
  if (input.to_selector) {
    const el = document.querySelector(input.to_selector);
    if (!el) {
      throw new Error(`Element not found: ${input.to_selector}`);
    }
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    const container = findScrollableContainer(el);
    const info = getScrollInfo(container);
    return {
      ok: true,
      action: "scrolled_to_element",
      selector: input.to_selector,
      container:
        container instanceof Window
          ? "window"
          : (container as HTMLElement).tagName?.toLowerCase(),
      ...info,
    };
  }

  const container = findScrollableContainer();

  if (input.to != null) {
    if (container instanceof Window) {
      window.scrollTo({ top: input.to, behavior: "smooth" });
    } else {
      container.scrollTo({ top: input.to, behavior: "smooth" });
    }
    const info = getScrollInfo(container);
    return {
      ok: true,
      action: "scrolled_to",
      y: input.to,
      container:
        container instanceof Window
          ? "window"
          : (container as HTMLElement).tagName?.toLowerCase(),
      ...info,
    };
  }

  if (input.by != null) {
    if (container instanceof Window) {
      window.scrollBy({ top: input.by, behavior: "smooth" });
    } else {
      container.scrollBy({ top: input.by, behavior: "smooth" });
    }
    const info = getScrollInfo(container);
    return {
      ok: true,
      action: "scrolled_by",
      offset: input.by,
      new_y: Math.round(info.scrollTop + input.by),
      container:
        container instanceof Window
          ? "window"
          : (container as HTMLElement).tagName?.toLowerCase(),
      scrollHeight: info.scrollHeight,
      clientHeight: info.clientHeight,
    };
  }

  throw new Error(
    "Provide one of: to (absolute Y), by (relative Y), or to_selector (CSS selector)."
  );
}

/* ========================================================================== */
/*  ui_click                                                              */
/* ========================================================================== */

export function handleBrowserClick(input: {
  selector?: string;
  x?: number;
  y?: number;
}): JsonValue {
  const el = resolveElement(input);
  if (!el) {
    throw new Error(
      input.selector
        ? `Element not found: ${input.selector}`
        : `No element at (${input.x}, ${input.y})`
    );
  }

  // Scroll into view if needed
  el.scrollIntoView({ behavior: "smooth", block: "nearest" });

  // Simulate realistic click
  const htmlEl = el as HTMLElement;
  htmlEl.dispatchEvent(
    new PointerEvent("pointerdown", { bubbles: true, cancelable: true })
  );
  htmlEl.dispatchEvent(
    new MouseEvent("mousedown", { bubbles: true, cancelable: true })
  );
  htmlEl.click();
  htmlEl.dispatchEvent(
    new PointerEvent("pointerup", { bubbles: true, cancelable: true })
  );
  htmlEl.dispatchEvent(
    new MouseEvent("mouseup", { bubbles: true, cancelable: true })
  );

  return {
    ok: true,
    tag: el.tagName.toLowerCase(),
    text: truncate(el.textContent || "", 60),
  };
}

/* ========================================================================== */
/*  ui_hover                                                              */
/* ========================================================================== */

export function handleBrowserHover(input: {
  selector?: string;
  x?: number;
  y?: number;
}): JsonValue {
  const el = resolveElement(input);
  if (!el) {
    throw new Error(
      input.selector
        ? `Element not found: ${input.selector}`
        : `No element at (${input.x}, ${input.y})`
    );
  }

  const htmlEl = el as HTMLElement;
  htmlEl.dispatchEvent(
    new PointerEvent("pointerenter", { bubbles: true, cancelable: true })
  );
  htmlEl.dispatchEvent(
    new MouseEvent("mouseover", { bubbles: true, cancelable: true })
  );
  htmlEl.dispatchEvent(
    new MouseEvent("mouseenter", { bubbles: true, cancelable: true })
  );

  return {
    ok: true,
    tag: el.tagName.toLowerCase(),
    text: truncate(el.textContent || "", 60),
  };
}

/* ========================================================================== */
/*  ui_focus                                                              */
/* ========================================================================== */

export function handleBrowserFocus(input: { selector: string }): JsonValue {
  const el = document.querySelector(input.selector);
  if (!el) {
    throw new Error(`Element not found: ${input.selector}`);
  }
  const htmlEl = el as HTMLElement;
  htmlEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
  htmlEl.focus();

  return {
    ok: true,
    tag: el.tagName.toLowerCase(),
    focused: document.activeElement === el,
  };
}

/* ========================================================================== */
/*  ui_input                                                              */
/* ========================================================================== */

export function handleBrowserInput(input: {
  selector: string;
  value: string;
  append?: boolean;
}): JsonValue {
  const el = document.querySelector(input.selector);
  if (!el) {
    throw new Error(`Element not found: ${input.selector}`);
  }

  const htmlEl = el as HTMLElement;

  // ContentEditable
  if (htmlEl.isContentEditable) {
    if (input.append) {
      htmlEl.textContent = (htmlEl.textContent || "") + input.value;
    } else {
      htmlEl.textContent = input.value;
    }
    htmlEl.dispatchEvent(new Event("input", { bubbles: true }));
    return {
      ok: true,
      tag: "contenteditable",
      value: truncate(htmlEl.textContent || "", 80),
    };
  }

  // Input / Textarea — use the native value setter for React compatibility
  const inp = el as HTMLInputElement | HTMLTextAreaElement;
  const newValue = input.append ? (inp.value || "") + input.value : input.value;

  // React overrides the value setter, so we need to use the native one
  const nativeInputValueSetter =
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set ??
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")
      ?.set;

  if (nativeInputValueSetter) {
    nativeInputValueSetter.call(inp, newValue);
  } else {
    inp.value = newValue;
  }

  // Dispatch events that React and native listeners respond to
  inp.dispatchEvent(new Event("input", { bubbles: true }));
  inp.dispatchEvent(new Event("change", { bubbles: true }));

  return {
    ok: true,
    tag: inp.tagName.toLowerCase(),
    type: inp.type || undefined,
    value: truncate(newValue, 80),
  } as JsonValue;
}
