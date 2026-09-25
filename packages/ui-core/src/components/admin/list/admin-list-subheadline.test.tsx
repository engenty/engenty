/** @vitest-environment happy-dom */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Table, TableBody } from "../../ui/table.js";
import { AdminListSubheadlineRow } from "./admin-list-subheadline.js";

afterEach(() => {
  cleanup();
});

function renderRowCells(
  props: Parameters<typeof AdminListSubheadlineRow>[0]
): HTMLTableCellElement[] {
  const { container } = render(
    <Table>
      <TableBody>
        <AdminListSubheadlineRow {...props} />
      </TableBody>
    </Table>
  );
  return [...container.querySelectorAll("td")];
}

describe("AdminListSubheadlineRow", () => {
  it("fills exactly colSpan columns behind an empty selection cell", () => {
    const cells = renderRowCells({ colSpan: 4, children: "Team" });
    expect(cells.map((c) => c.getAttribute("aria-hidden"))).toEqual([
      "true",
      null,
    ]);
    expect(cells[1]?.getAttribute("colspan")).toBe("3");
  });

  it("spans the full row when leadingOffset is none", () => {
    const cells = renderRowCells({
      colSpan: 3,
      leadingOffset: "none",
      children: "Ungrouped",
    });
    expect(cells).toHaveLength(1);
    expect(cells[0]?.getAttribute("colspan")).toBe("3");
  });
});
