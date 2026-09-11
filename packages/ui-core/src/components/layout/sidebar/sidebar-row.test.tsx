/** @vitest-environment happy-dom */
import { cleanup, render, screen } from "@testing-library/react";
import { FileText } from "lucide-react";
import { afterEach, describe, expect, it } from "vitest";
import {
  sidebarColumnContentInsetEndClassName,
  sidebarRowActionsOverlayClassName,
} from "./sidebar-classes.js";
import { SidebarMenu } from "./sidebar-primitives.js";
import {
  SIDEBAR_ROW_INDENT_BASE_PX,
  SIDEBAR_ROW_INDENT_STEP_PX,
  SidebarRow,
  SidebarRowActions,
  SidebarRowButton,
  SidebarRowLeadingIcon,
  SidebarSectionLabel,
  sidebarRowPaddingLeftPx,
  sidebarRowPaddingLeftPxNoLeadingIcon,
} from "./sidebar-row.js";

afterEach(() => {
  cleanup();
});

describe("SidebarMenu", () => {
  it("applies column end inset for truncated row titles", () => {
    const { container } = render(
      <SidebarMenu>
        <li>item</li>
      </SidebarMenu>
    );
    const menu = container.querySelector("[data-slot='sidebar-menu']");
    expect(menu?.className).toContain(sidebarColumnContentInsetEndClassName);
  });
});

describe("sidebarRowPaddingLeftPx", () => {
  it("uses KB article-tree indent formula", () => {
    expect(sidebarRowPaddingLeftPx(0)).toBe(SIDEBAR_ROW_INDENT_BASE_PX);
    expect(sidebarRowPaddingLeftPx(1)).toBe(
      SIDEBAR_ROW_INDENT_BASE_PX + SIDEBAR_ROW_INDENT_STEP_PX
    );
    expect(sidebarRowPaddingLeftPx(3)).toBe(8 + 3 * 12);
  });
});

describe("sidebarRowPaddingLeftPxNoLeadingIcon", () => {
  it("aligns iconless rows with sibling rows at the same depth (no empty icon gutter)", () => {
    // The rebuilt sidebar aligns iconless article rows with their sibling
    // categories at the same depth — same left padding as a row that has a
    // leading icon, with the icon slot reused for the leaf dot.
    expect(sidebarRowPaddingLeftPxNoLeadingIcon(0)).toBe(
      sidebarRowPaddingLeftPx(0)
    );
    expect(sidebarRowPaddingLeftPxNoLeadingIcon(1)).toBe(
      sidebarRowPaddingLeftPx(1)
    );
    expect(sidebarRowPaddingLeftPxNoLeadingIcon(2)).toBe(
      sidebarRowPaddingLeftPx(2)
    );
  });
});

describe("SidebarRow", () => {
  it("applies depth indent on the row shell", () => {
    const { container } = render(
      <SidebarRow data-testid="row-item" depth={2}>
        <span>child</span>
      </SidebarRow>
    );
    const shell = container.querySelector(
      "[data-slot='sidebar-row']"
    ) as HTMLElement | null;
    expect(shell).toBeTruthy();
    expect(shell?.style.paddingLeft).toBe(`${sidebarRowPaddingLeftPx(2)}px`);
  });

  it("uses icon-less indent variant for KB article rows under folders", () => {
    const { container } = render(
      <SidebarRow depth={2} indentVariant="noLeadingIcon">
        <span>child</span>
      </SidebarRow>
    );
    const shell = container.querySelector(
      "[data-slot='sidebar-row']"
    ) as HTMLElement | null;
    expect(shell?.style.paddingLeft).toBe(
      `${sidebarRowPaddingLeftPxNoLeadingIcon(2)}px`
    );
  });

  it("applies active typography on the row shell", () => {
    const { container } = render(
      <SidebarRow isActive>
        <span>child</span>
      </SidebarRow>
    );
    const shell = container.querySelector("[data-slot='sidebar-row']");
    expect(shell?.className).toMatch(/\bfont-medium\b/);
    expect(shell?.className).toMatch(/\btext-foreground\b/);
  });

  it("omits active typography when inactive", () => {
    const { container } = render(
      <SidebarRow isActive={false}>
        <span>child</span>
      </SidebarRow>
    );
    const shell = container.querySelector("[data-slot='sidebar-row']");
    expect(shell?.className).not.toMatch(/\bfont-medium\b/);
  });
});

describe("SidebarRowLeadingIcon", () => {
  it("renders the default icon", () => {
    render(
      <SidebarRowLeadingIcon icon={<FileText data-testid="leading-icon" />} />
    );
    expect(screen.getByTestId("leading-icon")).toBeTruthy();
  });

  it("renders chevron in place of the icon by default", () => {
    render(
      <SidebarRowLeadingIcon
        chevronSlot={<button type="button">Expand</button>}
        icon={<FileText data-testid="leading-icon" />}
      />
    );
    expect(screen.queryByTestId("leading-icon")).toBeNull();
    expect(screen.getByRole("button", { name: "Expand" })).toBeTruthy();
  });

  it("keeps the icon when alwaysShowChevron is false", () => {
    render(
      <SidebarRowLeadingIcon
        alwaysShowChevron={false}
        chevronSlot={<button type="button">Expand</button>}
        icon={<FileText data-testid="leading-icon" />}
      />
    );
    expect(screen.getByTestId("leading-icon")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Expand" })).toBeTruthy();
  });
});

describe("SidebarRowButton", () => {
  it("renders title content with row button slot", () => {
    render(
      <SidebarRowButton isActive={false} type="button">
        <span className="truncate">Article title</span>
      </SidebarRowButton>
    );
    expect(screen.getByText("Article title")).toBeTruthy();
    expect(
      document.querySelector("[data-slot='sidebar-row-button']")
    ).toBeTruthy();
  });

  it("uses default size and tree variant styling", () => {
    render(
      <SidebarRowButton isActive={false} type="button">
        Article title
      </SidebarRowButton>
    );
    const button = document.querySelector(
      "[data-slot='sidebar-row-button']"
    ) as HTMLElement | null;
    expect(button).toBeTruthy();
    expect(button?.className).toMatch(/\btext-sm\b/);
    expect(button?.className).not.toMatch(/\btext-base\b/);
    expect(button?.className).toMatch(/\bmin-h-8\b/);
    expect(button?.className).toMatch(/\bflex-1\b/);
    expect(button?.className).toMatch(/\btext-foreground\b/);
    expect(button?.className).not.toMatch(/\btext-muted-foreground\b/);
  });

  it("applies active tree variant foreground when active", () => {
    render(
      <SidebarRowButton isActive type="button">
        Active article
      </SidebarRowButton>
    );
    const button = document.querySelector(
      "[data-slot='sidebar-row-button']"
    ) as HTMLElement | null;
    expect(button?.className).toMatch(/\btext-foreground\b/);
    expect(button?.getAttribute("data-active")).toBe("true");
  });

  it("applies compact sm size when requested", () => {
    render(
      <SidebarRowButton isActive={false} size="sm" type="button">
        Settings
      </SidebarRowButton>
    );
    const button = document.querySelector(
      "[data-slot='sidebar-row-button']"
    ) as HTMLElement | null;
    expect(button?.className).toMatch(/\btext-xs\b/);
    expect(button?.className).toMatch(/\bmin-h-7\b/);
    expect(button?.className).not.toMatch(/\bmin-h-8\b/);
  });
});

describe("SidebarRowActions", () => {
  it("includes the shared overlay class names", () => {
    const { container } = render(
      <SidebarRowActions>
        <button type="button">More</button>
      </SidebarRowActions>
    );
    const actions = container.querySelector(
      "[data-slot='sidebar-row-actions']"
    );
    expect(actions).toBeTruthy();
    for (const token of sidebarRowActionsOverlayClassName.split(/\s+/)) {
      expect(actions?.className).toContain(token);
    }
  });

  it("forces visibility when forceVisible is set", () => {
    const { container } = render(
      <SidebarRowActions forceVisible>
        <button type="button">More</button>
      </SidebarRowActions>
    );
    const actions = container.querySelector(
      "[data-slot='sidebar-row-actions']"
    );
    expect(actions?.className).toMatch(/\bopacity-100\b/);
    expect(actions?.className).toMatch(/\bpointer-events-auto\b/);
  });
});

describe("SidebarSectionLabel", () => {
  it("aligns root section labels to root row icons by default", () => {
    const { container } = render(
      <SidebarSectionLabel>Favorites</SidebarSectionLabel>
    );
    const label = container.querySelector(
      "[data-slot='sidebar-section-label']"
    );
    expect(label?.className).toMatch(/pl-\[calc\(0\.5rem/);
  });

  it("aligns nested section labels when align is nested", () => {
    const { container } = render(
      <SidebarSectionLabel align="nested">Nested</SidebarSectionLabel>
    );
    const label = container.querySelector(
      "[data-slot='sidebar-section-label']"
    );
    expect(label?.className).toMatch(/pl-\[calc\(0\.125rem/);
  });
});
