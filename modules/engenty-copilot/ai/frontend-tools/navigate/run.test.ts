// `navigate` used to return `{ok:true}` for any internal-looking string, so a
// path matching no route read as success: React Router fell through to the
// catch-all back to the chat, and the agent reported the page as opened.
import { describe, expect, it, vi } from "vitest";
import {
  type NavigateRouteTable,
  resolveNavigateTarget,
  runNavigateFrontendTool,
} from "./run.js";

/** Stand-in for React Router's matchPath: exact match, `:param` eats a segment. */
function matches(pattern: string, pathname: string): boolean {
  const patternParts = pattern.split("/");
  const pathParts = pathname.split("/");
  if (patternParts.length !== pathParts.length) {
    return false;
  }
  return patternParts.every(
    (part, index) => part.startsWith(":") || part === pathParts[index]
  );
}

const ROUTES: NavigateRouteTable = {
  matches,
  patterns: [
    "/mdl/commercial-settings/settings",
    "/mdl/contacts",
    "/mdl/contacts/:id",
    "/mdl/contacts/settings",
    "/mdl/engenty-remote/pair",
    "/mdl/engenty-remote/settings",
    "/mdl/team/:id",
    "/mdl/team/:id/edit",
  ],
};

describe("resolveNavigateTarget", () => {
  it("passes a path that matches a registered route", () => {
    expect(
      resolveNavigateTarget({ routes: ROUTES, to: "/mdl/contacts" })
    ).toEqual({ ok: true, to: "/mdl/contacts" });
  });

  it("resolves a module prefix that owns exactly one static page", () => {
    // The reported bug: the agent is handed `/mdl/commercial-settings`, but the
    // module only registers `/mdl/commercial-settings/settings`.
    expect(
      resolveNavigateTarget({
        routes: ROUTES,
        to: "/mdl/commercial-settings",
      })
    ).toEqual({
      ok: true,
      resolvedFrom: "/mdl/commercial-settings",
      to: "/mdl/commercial-settings/settings",
    });
  });

  it("refuses to guess when a prefix owns several static pages", () => {
    const result = resolveNavigateTarget({
      routes: ROUTES,
      to: "/mdl/engenty-remote",
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.candidates).toEqual([
      "/mdl/engenty-remote/pair",
      "/mdl/engenty-remote/settings",
    ]);
  });

  it("does not resolve a prefix whose children all need an id", () => {
    // Inventing an id would trade a visible failure for a silent 404.
    const result = resolveNavigateTarget({ routes: ROUTES, to: "/mdl/team" });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.candidates).toContain("/mdl/team/:id");
  });

  it("keeps the query string when it resolves a prefix", () => {
    const result = resolveNavigateTarget({
      routes: ROUTES,
      to: "/mdl/commercial-settings?tab=tax",
    });
    expect(result.ok === true && result.to).toBe(
      "/mdl/commercial-settings/settings?tab=tax"
    );
  });

  it("accepts host paths outside /mdl/, which the table does not cover", () => {
    // Host routes never reach the contribution list: absent means unseen.
    expect(
      resolveNavigateTarget({ routes: ROUTES, to: "/settings/ai" })
    ).toEqual({ ok: true, to: "/settings/ai" });
  });
});

describe("runNavigateFrontendTool", () => {
  it("reports the path it actually navigated to, not the one asked for", () => {
    // The agent narrates this result, so it must name where it landed.
    const navigate = vi.fn();
    const result = runNavigateFrontendTool(
      { to: "/mdl/commercial-settings" },
      navigate,
      { routes: ROUTES }
    );
    expect(navigate).toHaveBeenCalledWith("/mdl/commercial-settings/settings", {
      replace: false,
    });
    expect(result).toEqual({
      ok: true,
      resolved_from: "/mdl/commercial-settings",
      to: "/mdl/commercial-settings/settings",
    });
  });

  it("throws with the real routes when nothing matches", () => {
    const navigate = vi.fn();
    expect(() =>
      runNavigateFrontendTool({ to: "/mdl/engenty-remote" }, navigate, {
        routes: ROUTES,
      })
    ).toThrow(/\/mdl\/engenty-remote\/pair/);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("navigates unvalidated when no route table is available", () => {
    // Contributions not resolved yet — fall back, do not refuse.
    const navigate = vi.fn();
    expect(runNavigateFrontendTool({ to: "/mdl/whatever" }, navigate)).toEqual({
      ok: true,
      to: "/mdl/whatever",
    });
    expect(navigate).toHaveBeenCalledWith("/mdl/whatever", { replace: false });
  });

  it("still blocks external and protocol-relative targets", () => {
    const navigate = vi.fn();
    expect(() =>
      runNavigateFrontendTool({ to: "//evil.example.com" }, navigate, {
        routes: ROUTES,
      })
    ).toThrow(/internal application paths/);
    expect(() =>
      runNavigateFrontendTool({ to: "https://evil.example.com" }, navigate, {
        routes: ROUTES,
      })
    ).toThrow(/internal application paths/);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("passes replace through", () => {
    const navigate = vi.fn();
    runNavigateFrontendTool({ replace: true, to: "/mdl/contacts" }, navigate, {
      routes: ROUTES,
    });
    expect(navigate).toHaveBeenCalledWith("/mdl/contacts", { replace: true });
  });
});
