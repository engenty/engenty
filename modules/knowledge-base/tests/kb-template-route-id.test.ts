import { describe, expect, it } from "vitest";
import {
  isKbTemplateEditorNewRoute,
  isKbTemplateNewEditorPath,
  isKbTemplateRouteIdValid,
  resolveKbTemplateRouteId,
} from "../ui/lib/kb-template-route-id.js";

describe("kb template route id", () => {
  it("detects new editor from templateId param", () => {
    expect(isKbTemplateEditorNewRoute("new")).toBe(true);
  });

  it("detects new editor from pathname when param is missing", () => {
    expect(
      isKbTemplateEditorNewRoute(
        "",
        "/mdl/knowledge-base/kb/default/templates/new"
      )
    ).toBe(true);
  });

  it("matches new editor path helper", () => {
    expect(
      isKbTemplateNewEditorPath("/mdl/knowledge-base/kb/default/templates/new")
    ).toBe(true);
  });

  it("rejects invalid edit ids", () => {
    expect(isKbTemplateRouteIdValid("")).toBe(false);
    expect(isKbTemplateRouteIdValid("new")).toBe(false);
    expect(isKbTemplateRouteIdValid("undefined")).toBe(false);
  });

  it("accepts normal template ids", () => {
    expect(
      isKbTemplateRouteIdValid("019e7c97-7786-725f-ba87-2fd9787a1219")
    ).toBe(true);
  });

  it("returns empty resolved id for new route", () => {
    expect(resolveKbTemplateRouteId("new", undefined)).toBe("");
  });
});
