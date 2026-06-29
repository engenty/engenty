/**
 * Caret position in viewport for a `<textarea>`, using a short-lived mirror element
 * (same wrapping/font as the textarea). Used to anchor floating @-mention menus.
 *
 * Based on the `textarea-caret-position` approach (MIT, component/textarea-caret-position).
 */

const STYLE_PROPS = [
  "direction",
  "box-sizing",
  "width",
  "height",
  "overflow-x",
  "overflow-y",
  "border-top-width",
  "border-right-width",
  "border-bottom-width",
  "border-left-width",
  "border-style",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "font-style",
  "font-variant",
  "font-weight",
  "font-stretch",
  "font-size",
  "font-size-adjust",
  "line-height",
  "font-family",
  "text-align",
  "text-transform",
  "text-indent",
  "text-decoration",
  "letter-spacing",
  "word-spacing",
  "tab-size",
] as const;

const MIRROR_ID = "__engenty_textarea_caret_mirror__";

export function getTextareaCaretViewportRect(
  textarea: HTMLTextAreaElement,
  position: number
): DOMRect {
  if (typeof document === "undefined") {
    return new DOMRect();
  }

  const clamped = Math.max(0, Math.min(position, textarea.value.length));
  const computed = window.getComputedStyle(textarea);

  document.getElementById(MIRROR_ID)?.remove();

  const mirror = document.createElement("div");
  mirror.id = MIRROR_ID;

  const taRect = textarea.getBoundingClientRect();
  mirror.style.position = "fixed";
  mirror.style.top = `${taRect.top}px`;
  mirror.style.left = `${taRect.left}px`;
  mirror.style.zIndex = "2147483646";
  mirror.style.visibility = "hidden";
  mirror.style.pointerEvents = "none";
  mirror.style.whiteSpace = "pre-wrap";
  mirror.style.wordBreak = "break-word";
  mirror.style.width = `${textarea.clientWidth}px`;
  mirror.style.height = `${textarea.clientHeight}px`;
  mirror.style.overflow = "hidden";
  mirror.scrollTop = textarea.scrollTop;
  mirror.scrollLeft = textarea.scrollLeft;

  for (const prop of STYLE_PROPS) {
    mirror.style.setProperty(prop, computed.getPropertyValue(prop));
  }

  const isFirefox =
    typeof navigator !== "undefined" && /firefox/i.test(navigator.userAgent);
  if (
    isFirefox &&
    textarea.scrollHeight > Number.parseInt(computed.height ?? "0", 10)
  ) {
    mirror.style.overflowY = "scroll";
  }

  const before = document.createTextNode(textarea.value.slice(0, clamped));
  const span = document.createElement("span");
  span.textContent = textarea.value.slice(clamped) || ".";
  mirror.appendChild(before);
  mirror.appendChild(span);

  document.body.appendChild(mirror);
  const spanRect = span.getBoundingClientRect();
  document.body.removeChild(mirror);

  const h =
    spanRect.height ||
    Number.parseFloat(computed.lineHeight ?? "") ||
    Number.parseFloat(computed.fontSize ?? "") * 1.2 ||
    16;

  return new DOMRect(
    spanRect.left,
    spanRect.top,
    Math.max(spanRect.width, 2),
    h
  );
}
