import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AuthCard } from "./auth-card";

describe("AuthCard", () => {
  it("renders login content by default", () => {
    vi.stubGlobal("navigator", { language: "en-US" });
    const html = renderToString(
      createElement(MemoryRouter, null, createElement(AuthCard))
    );
    expect(html).toContain("Welcome back");
    expect(html).toContain("Sign in");
    vi.unstubAllGlobals();
  });
});
