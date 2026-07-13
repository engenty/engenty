/**
 * The in-page half of the bridge. `contentMain` is injected with
 * `chrome.scripting.executeScript({ func: contentMain, args: [command] })`,
 * which serializes the function — so it must be fully self-contained: no
 * imports, no references to module scope. Type-only imports are fine (erased).
 *
 * Snapshot refs: every observe builds a fresh generation of the ref registry
 * (an element array stashed on the tab's isolated-world global, which
 * persists across executeScript calls until navigation). click/fill address
 * elements by `[ref=N]` from the MOST RECENT outline; acting on a stale
 * generation — or on an element that has since left the DOM — fails with
 * `refStale` so the agent re-observes instead of guessing.
 */

export type ContentCommand =
  | {
      kind: "observe";
      maxChars: number;
      mode: "outline" | "text";
    }
  | {
      expectedGeneration: number | null;
      kind: "click";
      ref: number;
    }
  | {
      expectedGeneration: number | null;
      kind: "fill";
      ref: number;
      submit: boolean;
      value: string;
    }
  | {
      kind: "wait_for";
      selector?: string;
      text?: string;
      timeoutMs: number;
    };

export interface ContentSuccess {
  found?: boolean;
  generation?: number;
  observe?: string;
  ok: true;
  outline?: string;
  title: string;
  url: string;
}

export interface ContentFailure {
  error: string;
  errorCode: "ref_stale" | "unsupported_element";
  ok: false;
}

export type ContentResult = ContentSuccess | ContentFailure;

interface RefRegistry {
  elements: Element[];
  generation: number;
}

export async function contentMain(
  command: ContentCommand
): Promise<ContentResult> {
  const REGISTRY_KEY = "__engentyBridgeRegistry";
  const scope = globalThis as typeof globalThis & {
    [REGISTRY_KEY]?: RefRegistry;
  };
  const NAME_MAX = 80;
  const TEXT_LINE_MAX = 160;
  const ACT_OBSERVE_MAX = 4000;

  const collapse = (text: string): string => text.replace(/\s+/g, " ").trim();

  const truncate = (text: string, max: number): string =>
    text.length > max ? `${text.slice(0, max - 1)}…` : text;

  const isHidden = (el: Element): boolean => {
    if (el.hasAttribute("hidden")) {
      return true;
    }
    if (el.getAttribute("aria-hidden") === "true") {
      return true;
    }
    const tag = el.tagName.toLowerCase();
    if (tag === "script" || tag === "style" || tag === "template") {
      return true;
    }
    if (tag === "input" && el.getAttribute("type") === "hidden") {
      return true;
    }
    const style = window.getComputedStyle(el);
    return style.display === "none" || style.visibility === "hidden";
  };

  const interactiveRole = (el: Element): string | null => {
    const explicit = el.getAttribute("role");
    const interactiveExplicit = [
      "button",
      "link",
      "checkbox",
      "radio",
      "tab",
      "menuitem",
      "combobox",
      "switch",
      "option",
      "textbox",
      "searchbox",
      "slider",
    ];
    if (explicit && interactiveExplicit.includes(explicit)) {
      return explicit;
    }
    const tag = el.tagName.toLowerCase();
    if (tag === "a" && el.hasAttribute("href")) {
      return "link";
    }
    if (tag === "button" || tag === "summary") {
      return "button";
    }
    if (tag === "select") {
      return "combobox";
    }
    if (tag === "textarea") {
      return "textbox";
    }
    if (tag === "input") {
      const type = (el.getAttribute("type") ?? "text").toLowerCase();
      if (type === "button" || type === "submit" || type === "reset") {
        return "button";
      }
      if (type === "checkbox" || type === "radio") {
        return type;
      }
      return "textbox";
    }
    if (el.getAttribute("contenteditable") === "true") {
      return "textbox";
    }
    return null;
  };

  const landmarkRole = (el: Element): string | null => {
    const tag = el.tagName.toLowerCase();
    const byTag: Record<string, string> = {
      aside: "complementary",
      footer: "contentinfo",
      form: "form",
      header: "banner",
      main: "main",
      nav: "navigation",
    };
    const explicit = el.getAttribute("role");
    const landmarks = [
      "banner",
      "complementary",
      "contentinfo",
      "form",
      "main",
      "navigation",
      "region",
      "search",
    ];
    if (explicit && landmarks.includes(explicit)) {
      return explicit;
    }
    return byTag[tag] ?? null;
  };

  const accessibleName = (el: Element): string => {
    const ariaLabel = el.getAttribute("aria-label");
    if (ariaLabel) {
      return collapse(ariaLabel);
    }
    const labelledBy = el.getAttribute("aria-labelledby");
    if (labelledBy) {
      const parts = labelledBy
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent ?? "")
        .map(collapse)
        .filter((part) => part.length > 0);
      if (parts.length > 0) {
        return parts.join(" ");
      }
    }
    const tag = el.tagName.toLowerCase();
    if (tag === "input" || tag === "select" || tag === "textarea") {
      const id = el.getAttribute("id");
      if (id) {
        const label = document.querySelector(`label[for="${id}"]`);
        if (label?.textContent) {
          return collapse(label.textContent);
        }
      }
      const wrapping = el.closest("label");
      if (wrapping?.textContent) {
        return collapse(wrapping.textContent);
      }
      const placeholder = el.getAttribute("placeholder");
      if (placeholder) {
        return collapse(placeholder);
      }
      const value = el.getAttribute("value");
      if (tag === "input" && value) {
        const type = (el.getAttribute("type") ?? "").toLowerCase();
        if (type === "submit" || type === "button" || type === "reset") {
          return collapse(value);
        }
      }
      return el.getAttribute("name") ?? "";
    }
    if (tag === "img") {
      return collapse(el.getAttribute("alt") ?? "");
    }
    const text = el.textContent ? collapse(el.textContent) : "";
    if (text) {
      return text;
    }
    return collapse(el.getAttribute("title") ?? "");
  };

  const stateOf = (el: Element): string[] => {
    const states: string[] = [];
    const tag = el.tagName.toLowerCase();
    if (
      el.hasAttribute("disabled") ||
      el.getAttribute("aria-disabled") === "true"
    ) {
      states.push("disabled");
    }
    if (el.hasAttribute("required")) {
      states.push("required");
    }
    if (
      (el as HTMLInputElement).checked === true ||
      el.getAttribute("aria-checked") === "true"
    ) {
      states.push("checked");
    }
    if (el.getAttribute("aria-expanded") === "true") {
      states.push("expanded");
    }
    if (el.getAttribute("aria-selected") === "true") {
      states.push("selected");
    }
    if (tag === "input" || tag === "textarea") {
      const type = (el.getAttribute("type") ?? "text").toLowerCase();
      const valueless = ["button", "checkbox", "radio", "reset", "submit"];
      const value = valueless.includes(type)
        ? ""
        : (el as HTMLInputElement).value;
      if (value) {
        states.push(
          type === "password"
            ? "filled"
            : `value="${truncate(collapse(value), 30)}"`
        );
      }
    }
    if (tag === "select") {
      const select = el as HTMLSelectElement;
      const selected = select.selectedOptions?.[0]?.textContent;
      if (selected) {
        states.push(`selected="${truncate(collapse(selected), 30)}"`);
      }
    }
    if (tag === "a") {
      const href = el.getAttribute("href");
      if (href && href !== "#") {
        states.push(`href=${truncate(href, 60)}`);
      }
    }
    return states;
  };

  const TRUNCATION_MARKER = "…truncated";

  const buildOutline = (
    maxChars: number
  ): { generation: number; text: string } => {
    const elements: Element[] = [];
    const lines: string[] = [];
    let used = 0;
    let truncated = false;

    const push = (line: string): boolean => {
      if (used + line.length + 1 > maxChars) {
        truncated = true;
        return false;
      }
      lines.push(line);
      used += line.length + 1;
      return true;
    };

    const walk = (node: Node): boolean => {
      for (const child of Array.from(node.childNodes)) {
        if (child.nodeType === Node.TEXT_NODE) {
          const text = collapse(child.textContent ?? "");
          if (text && !push(`"${truncate(text, TEXT_LINE_MAX)}"`)) {
            return false;
          }
          continue;
        }
        if (child.nodeType !== Node.ELEMENT_NODE) {
          continue;
        }
        const el = child as Element;
        if (isHidden(el)) {
          continue;
        }
        const role = interactiveRole(el);
        if (role) {
          const ref = elements.length;
          elements.push(el);
          const name = truncate(accessibleName(el), NAME_MAX);
          const states = stateOf(el);
          const suffix = states.length > 0 ? ` (${states.join(", ")})` : "";
          if (!push(`[ref=${ref}] ${role} "${name}"${suffix}`)) {
            return false;
          }
          continue;
        }
        const headingMatch = /^h([1-6])$/.exec(el.tagName.toLowerCase());
        if (headingMatch) {
          const name = truncate(collapse(el.textContent ?? ""), NAME_MAX);
          if (!push(`h${headingMatch[1]} "${name}"`)) {
            return false;
          }
          continue;
        }
        const landmark = landmarkRole(el);
        if (landmark) {
          const label = collapse(el.getAttribute("aria-label") ?? "");
          const line = label
            ? `<${landmark} "${truncate(label, NAME_MAX)}">`
            : `<${landmark}>`;
          if (!push(line)) {
            return false;
          }
        }
        if (!walk(el)) {
          return false;
        }
      }
      return true;
    };

    walk(document.body);
    if (truncated) {
      lines.push(TRUNCATION_MARKER);
    }

    const previous = scope[REGISTRY_KEY];
    const generation = (previous?.generation ?? 0) + 1;
    scope[REGISTRY_KEY] = { elements, generation };
    return { generation, text: lines.join("\n") };
  };

  const buildTextOnly = (maxChars: number): string => {
    const chunks: string[] = [];
    let used = 0;
    let truncated = false;
    const walk = (node: Node): boolean => {
      for (const child of Array.from(node.childNodes)) {
        if (child.nodeType === Node.TEXT_NODE) {
          const text = collapse(child.textContent ?? "");
          if (!text) {
            continue;
          }
          if (used + text.length + 1 > maxChars) {
            truncated = true;
            return false;
          }
          chunks.push(text);
          used += text.length + 1;
          continue;
        }
        if (child.nodeType !== Node.ELEMENT_NODE) {
          continue;
        }
        const el = child as Element;
        if (isHidden(el)) {
          continue;
        }
        if (!walk(el)) {
          return false;
        }
      }
      return true;
    };
    walk(document.body);
    if (truncated) {
      chunks.push(TRUNCATION_MARKER);
    }
    return chunks.join("\n");
  };

  const resolveRef = (
    ref: number,
    expectedGeneration: number | null
  ): Element | ContentFailure => {
    const registry = scope[REGISTRY_KEY];
    if (!registry) {
      return {
        error: "no snapshot exists for this page — observe first",
        errorCode: "ref_stale",
        ok: false,
      };
    }
    if (
      expectedGeneration !== null &&
      registry.generation !== expectedGeneration
    ) {
      return {
        error: "the snapshot is stale — observe again and use fresh refs",
        errorCode: "ref_stale",
        ok: false,
      };
    }
    const el = registry.elements[ref];
    if (!el?.isConnected) {
      return {
        error: `ref ${ref} no longer exists on the page — observe again`,
        errorCode: "ref_stale",
        ok: false,
      };
    }
    return el;
  };

  const pageMeta = () => ({
    title: document.title,
    url: window.location.href,
  });

  if (command.kind === "observe") {
    if (command.mode === "text") {
      return {
        ...pageMeta(),
        ok: true,
        outline: buildTextOnly(command.maxChars),
      };
    }
    const { generation, text } = buildOutline(command.maxChars);
    return { ...pageMeta(), generation, ok: true, outline: text };
  }

  if (command.kind === "wait_for") {
    const deadline = Date.now() + command.timeoutMs;
    const check = (): boolean => {
      if (command.selector && document.querySelector(command.selector)) {
        return true;
      }
      if (
        command.text &&
        (document.body.textContent ?? "").includes(command.text)
      ) {
        return true;
      }
      return false;
    };
    for (;;) {
      if (check()) {
        return { ...pageMeta(), found: true, ok: true };
      }
      if (Date.now() >= deadline) {
        return { ...pageMeta(), found: false, ok: true };
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  if (command.kind === "click") {
    const resolved = resolveRef(command.ref, command.expectedGeneration);
    if (!(resolved instanceof Element)) {
      return resolved;
    }
    const el = resolved as HTMLElement;
    el.focus?.();
    el.click();
    const { generation, text } = buildOutline(ACT_OBSERVE_MAX);
    return { ...pageMeta(), generation, observe: text, ok: true };
  }

  // fill
  const resolved = resolveRef(command.ref, command.expectedGeneration);
  if (!(resolved instanceof Element)) {
    return resolved;
  }
  const el = resolved as HTMLElement;
  const tag = el.tagName.toLowerCase();
  el.focus?.();
  if (tag === "input" || tag === "textarea") {
    // Use the native setter so framework-controlled inputs (React et al.)
    // observe the change through their own value tracking.
    const proto =
      tag === "textarea"
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) {
      setter.call(el, command.value);
    } else {
      (el as HTMLInputElement).value = command.value;
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  } else if (tag === "select") {
    const select = el as unknown as HTMLSelectElement;
    const option = Array.from(select.options).find(
      (o) =>
        o.value === command.value ||
        collapse(o.textContent ?? "") === collapse(command.value)
    );
    select.value = option ? option.value : command.value;
    el.dispatchEvent(new Event("change", { bubbles: true }));
  } else if (el.getAttribute("contenteditable") === "true") {
    el.textContent = command.value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  } else {
    return {
      error: `ref points at a <${tag}> which cannot be filled`,
      errorCode: "unsupported_element",
      ok: false,
    };
  }
  if (command.submit) {
    const form = (el as HTMLInputElement).form ?? el.closest("form");
    if (form) {
      form.requestSubmit();
    } else {
      el.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "Enter" })
      );
      el.dispatchEvent(
        new KeyboardEvent("keyup", { bubbles: true, key: "Enter" })
      );
    }
  }
  const { generation, text } = buildOutline(ACT_OBSERVE_MAX);
  return { ...pageMeta(), generation, observe: text, ok: true };
}
