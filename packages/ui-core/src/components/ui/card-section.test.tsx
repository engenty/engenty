/** @vitest-environment happy-dom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CardSection } from "./card-section.js";

afterEach(() => {
  cleanup();
});

describe("CardSection", () => {
  it("convenience API renders title, description, and body children", () => {
    render(
      <CardSection description="Helper copy" title="Section title">
        <span>Row content</span>
      </CardSection>
    );
    expect(
      screen.getByRole("heading", { level: 2, name: "Section title" })
    ).toBeTruthy();
    expect(screen.getByText("Helper copy")).toBeTruthy();
    expect(screen.getByText("Row content")).toBeTruthy();
  });

  it("compound API supports Header, Body, and Caption", () => {
    render(
      <CardSection>
        <CardSection.Header title="Billing" />
        <CardSection.Body variant="flush">
          <span>KV row</span>
        </CardSection.Body>
        <CardSection.Caption>Footnote</CardSection.Caption>
      </CardSection>
    );
    expect(
      screen.getByRole("heading", { level: 2, name: "Billing" })
    ).toBeTruthy();
    expect(screen.getByText("KV row")).toBeTruthy();
    expect(screen.getByText("Footnote")).toBeTruthy();
  });

  it("allows title-only sections without description", () => {
    render(<CardSection title="Notes">body</CardSection>);
    expect(
      screen.getByRole("heading", { level: 2, name: "Notes" })
    ).toBeTruthy();
    expect(screen.getByText("body")).toBeTruthy();
  });

  it("applies header variants without hand-rolled title classes", () => {
    const { rerender } = render(
      <CardSection.Header title="Default" variant="default" />
    );
    expect(screen.getByRole("heading", { level: 2 }).className).toContain(
      "text-lg"
    );

    rerender(<CardSection.Header title="Meta" variant="meta" />);
    const meta = screen.getByRole("heading", { level: 3, name: "Meta" });
    expect(meta.className).toContain("uppercase");
    expect(meta.className).toContain("text-xs");

    rerender(<CardSection.Header title="Display" variant="display" />);
    expect(screen.getByRole("heading", { level: 2 }).className).toContain(
      "font-heading"
    );
  });
});
