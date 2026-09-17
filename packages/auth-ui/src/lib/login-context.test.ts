import { describe, expect, it } from "vitest";
import { readLoginContext } from "./login-context";

describe("readLoginContext", () => {
  it("reads continue / continue_to / client_name", () => {
    expect(
      readLoginContext(new URLSearchParams("continue=Cursor")).continueTo
    ).toBe("Cursor");
    expect(
      readLoginContext(new URLSearchParams("continue_to=Gmail")).continueTo
    ).toBe("Gmail");
    expect(
      readLoginContext(new URLSearchParams("client_name=My%20App")).continueTo
    ).toBe("My App");
  });

  it("defaults MCP from flow or consent redirect", () => {
    expect(readLoginContext(new URLSearchParams("flow=mcp")).continueTo).toBe(
      "MCP"
    );
    expect(
      readLoginContext(
        new URLSearchParams("redirect=/oauth/consent?authorization_id=abc")
      ).continueTo
    ).toBe("MCP");
  });

  it("returns null for ordinary login", () => {
    expect(readLoginContext(new URLSearchParams()).continueTo).toBeNull();
    expect(
      readLoginContext(new URLSearchParams("redirect=/s/me")).continueTo
    ).toBeNull();
  });
});
