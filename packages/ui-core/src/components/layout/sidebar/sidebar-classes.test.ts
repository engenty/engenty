import { describe, expect, it } from "vitest";
import {
  sidebarColumnContentInsetClassName,
  sidebarColumnContentInsetEndClassName,
  sidebarColumnGutterClassName,
} from "./sidebar-classes.js";
import {
  SIDEBAR_ROW_INDENT_BASE_PX,
  sidebarRowPaddingLeftPx,
} from "./sidebar-row.js";

/** Tailwind `px-2` gutter applied to column header + panel. */
const SIDEBAR_COLUMN_GUTTER_PX = 8;

/** Tailwind `pl-2` content inset (header slot, search toolbar, row depth-0 indent). */
const SIDEBAR_COLUMN_CONTENT_INSET_PX = 8;

/** Row shell `px-0.5` horizontal padding. */
const SIDEBAR_ROW_SHELL_PX_PX = 2;

/** {@link sidebarLeadingIconSlotClassName} width and default `size-3.5` icon width. */
const SIDEBAR_LEADING_SLOT_PX = 20;
const SIDEBAR_ROW_ICON_PX = 14;

function rowLeadingIconLeftPx(depth = 0): number {
  return (
    SIDEBAR_COLUMN_GUTTER_PX +
    sidebarRowPaddingLeftPx(depth) +
    SIDEBAR_ROW_SHELL_PX_PX +
    (SIDEBAR_LEADING_SLOT_PX - SIDEBAR_ROW_ICON_PX) / 2
  );
}

describe("sidebar column shell tokens", () => {
  it("uses horizontal gutter on column header and body", () => {
    expect(sidebarColumnGutterClassName).toBe("px-2");
  });

  it("uses content inset for header slot and panel body alignment", () => {
    expect(sidebarColumnContentInsetClassName).toBe("pl-2");
    expect(SIDEBAR_COLUMN_GUTTER_PX + SIDEBAR_COLUMN_CONTENT_INSET_PX).toBe(
      SIDEBAR_ROW_INDENT_BASE_PX + SIDEBAR_COLUMN_GUTTER_PX
    );
  });

  it("uses end inset on menus and toolbars for truncated titles", () => {
    expect(sidebarColumnContentInsetEndClassName).toBe("pr-1");
  });

  it("depth-0 row leading icon left edge uses KB indent formula", () => {
    expect(rowLeadingIconLeftPx(0)).toBe(21);
    expect(sidebarRowPaddingLeftPx(0)).toBe(SIDEBAR_ROW_INDENT_BASE_PX);
  });
});
