"use client";

import { PAGE_BREAK_TAG } from "../../lib/page-break.js";

/** Hidden sentinel so Streamdown allowlists `<page-break>` without a visual rule. */
export function PageBreakMarker(props: Record<string, unknown>) {
  const number = typeof props.number === "string" ? props.number : undefined;
  const printed = typeof props.printed === "string" ? props.printed : undefined;
  const total = typeof props.total === "string" ? props.total : undefined;
  return (
    <span
      aria-hidden
      className="hidden"
      data-page={number}
      data-page-printed={printed}
      data-page-total={total}
    />
  );
}

export const STREAMDOWN_PAGE_BREAK_COMPONENTS = {
  [PAGE_BREAK_TAG]: PageBreakMarker,
};
