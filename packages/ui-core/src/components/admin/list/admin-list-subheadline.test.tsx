/** @vitest-environment happy-dom */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Table, TableBody } from "../../ui/table.js";
import {
  AdminListSubheadline,
  AdminListSubheadlineRow,
  adminListSubheadlineSectionClass,
} from "./admin-list-subheadline.js";

afterEach(() => {
  cleanup();
});

describe("AdminListSubheadline", () => {
  it("uses heading font and group-title scale", () => {
    const { container } = render(
      <AdminListSubheadline>Engineering</AdminListSubheadline>
    );
    const el = container.querySelector("[data-slot='admin-list-subheadline']");
    expect(el?.className).toContain("font-heading");
    expect(el?.className).toContain("text-lg");
    expect(el?.className).toContain("font-semibold");
  });
});

describe("adminListSubheadlineSectionClass", () => {
  it("matches table subheadline divider and symmetric padding", () => {
    expect(adminListSubheadlineSectionClass()).toContain("border-primary");
    expect(adminListSubheadlineSectionClass()).toContain("border-b-2");
    expect(adminListSubheadlineSectionClass()).toContain("py-2.5");
    expect(adminListSubheadlineSectionClass(true)).toContain("py-1.5");
  });
});

describe("AdminListSubheadlineRow", () => {
  it("leaves the selection column empty so content aligns with the first data column", () => {
    const { container } = render(
      <Table>
        <TableBody>
          <AdminListSubheadlineRow colSpan={4}>
            Team Gföhler
          </AdminListSubheadlineRow>
        </TableBody>
      </Table>
    );

    const row = container.querySelector(
      "[data-slot='admin-list-subheadline-row']"
    );
    const cells = row?.querySelectorAll("td");
    expect(cells?.length).toBe(2);
    expect(cells?.[0]?.getAttribute("aria-hidden")).toBe("true");
    expect(cells?.[1]?.getAttribute("colspan")).toBe("3");
    expect(cells?.[1]?.textContent).toContain("Team Gföhler");
    expect(cells?.[0]?.className).toContain("border-b-2");
    expect(cells?.[0]?.className).toContain("border-primary");
    expect(cells?.[1]?.className).toContain("border-b-2");
    expect(cells?.[1]?.className).toContain("border-primary");
  });

  it("spans the full row when leadingOffset is none", () => {
    const { container } = render(
      <Table>
        <TableBody>
          <AdminListSubheadlineRow colSpan={3} leadingOffset="none">
            Ungrouped
          </AdminListSubheadlineRow>
        </TableBody>
      </Table>
    );

    const row = container.querySelector(
      "[data-slot='admin-list-subheadline-row']"
    );
    const cells = row?.querySelectorAll("td");
    expect(cells?.length).toBe(1);
    expect(cells?.[0]?.getAttribute("colspan")).toBe("3");
    expect(cells?.[0]?.className).toContain("border-b-2");
    expect(cells?.[0]?.className).toContain("border-primary");
  });
});
