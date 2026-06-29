/** @vitest-environment happy-dom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select.js";

afterEach(() => {
  cleanup();
});

// Base UI's Select.Value renders the raw selected value unless the Root is given
// an `items` map. The wrapper derives that map from the <SelectItem> children so
// the trigger shows the item's label (the Radix-era behavior), never the raw
// value such as a "__none__" sentinel or an id/code.
describe("Select trigger label resolution", () => {
  function renderSelect(value: string) {
    return render(
      <Select value={value}>
        <SelectTrigger>
          <SelectValue placeholder="Pick one" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">-</SelectItem>
          <SelectItem value="company">Company</SelectItem>
        </SelectContent>
      </Select>
    );
  }

  it("shows the item label instead of the raw value", () => {
    renderSelect("company");
    expect(screen.getByText("Company")).toBeTruthy();
    expect(screen.queryByText("company")).toBeNull();
  });

  it("resolves a sentinel value to its label rather than leaking '__none__'", () => {
    renderSelect("__none__");
    expect(screen.queryByText("__none__")).toBeNull();
    expect(screen.getByText("-")).toBeTruthy();
  });

  it("finds items nested through grouping/fragment wrappers", () => {
    render(
      <Select value="b">
        <SelectTrigger>
          <SelectValue placeholder="Pick one" />
        </SelectTrigger>
        <SelectContent>
          <>
            <SelectItem value="a">Alpha</SelectItem>
            <SelectItem value="b">Bravo</SelectItem>
          </>
        </SelectContent>
      </Select>
    );
    expect(screen.getByText("Bravo")).toBeTruthy();
    expect(screen.queryByText("b")).toBeNull();
  });
});
