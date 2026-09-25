/** @vitest-environment happy-dom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SearchableSelect } from "./searchable-select.js";

afterEach(() => {
  cleanup();
});

describe("SearchableSelect", () => {
  const options = [
    { label: "GPT-5 mini (openai/gpt-5-mini)", value: "openai/gpt-5-mini" },
    { label: "Claude Sonnet (anthropic/claude-sonnet-4-6)", value: "anthropic/claude-sonnet-4-6" },
  ];

  it("shows the selected option label instead of the raw value", () => {
    render(
      <SearchableSelect
        onValueChange={() => undefined}
        options={options}
        placeholder="Pick a model"
        value="openai/gpt-5-mini"
      />
    );

    expect(
      screen.getByText("GPT-5 mini (openai/gpt-5-mini)")
    ).toBeTruthy();
  });
});
