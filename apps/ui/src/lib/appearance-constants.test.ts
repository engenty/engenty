/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applyCustomColors,
  applySidebarColor,
  COLOR_SETS_PRESETS,
  DEFAULT_DARK_SIDEBAR,
  DEFAULT_LIGHT_SIDEBAR,
  resolveFontSizeScale,
} from "./appearance-constants";

describe("resolveFontSizeScale", () => {
  it("maps preset ids to scale factors", () => {
    expect(resolveFontSizeScale("100")).toBe(1);
    expect(resolveFontSizeScale("125")).toBe(1.25);
    expect(resolveFontSizeScale("80")).toBe(0.8);
  });

  it("falls back to default scale for unknown ids", () => {
    expect(resolveFontSizeScale("unknown")).toBe(1);
  });
});

describe("COLOR_SETS_PRESETS", () => {
  it("defines a non-empty dark.sidebar for every preset", () => {
    for (const preset of COLOR_SETS_PRESETS) {
      expect(preset.dark.sidebar).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(preset.dark.sidebar.toLowerCase()).not.toBe(DEFAULT_LIGHT_SIDEBAR);
    }
  });
});

describe("applyCustomColors", () => {
  beforeEach(() => {
    document.documentElement.classList.remove("dark");
    document.documentElement.style.removeProperty("--primary");
    document.documentElement.style.removeProperty("--secondary");
    document.documentElement.style.removeProperty("--background");
    document.documentElement.style.removeProperty("--paper");
    document.documentElement.style.removeProperty("--raw-sidebar");
    delete document.documentElement.dataset.rawPrimary;
    delete document.documentElement.dataset.rawSecondary;
    delete document.documentElement.dataset.rawBackground;
    delete document.documentElement.dataset.rawSidebar;
  });

  afterEach(() => {
    document.documentElement.classList.remove("dark");
    document.documentElement.style.removeProperty("--primary");
    document.documentElement.style.removeProperty("--secondary");
    document.documentElement.style.removeProperty("--background");
    document.documentElement.style.removeProperty("--paper");
    document.documentElement.style.removeProperty("--raw-sidebar");
    delete document.documentElement.dataset.rawPrimary;
    delete document.documentElement.dataset.rawSecondary;
    delete document.documentElement.dataset.rawBackground;
    delete document.documentElement.dataset.rawSidebar;
  });

  it("applies custom colors to documentElement style", () => {
    applyCustomColors("#112233", "#445566", "#778899");
    expect(
      document.documentElement.style.getPropertyValue("--raw-primary")
    ).toBe("#112233");
    expect(
      document.documentElement.style.getPropertyValue("--raw-secondary")
    ).toBe("#445566");
    expect(
      document.documentElement.style.getPropertyValue("--raw-background")
    ).toBe("#778899");
  });

  it("removes properties if values are defaults or empty", () => {
    document.documentElement.style.setProperty("--raw-primary", "#112233");
    applyCustomColors("#e0531b", "#f1f3f5", "#faf8f5");
    expect(
      document.documentElement.style.getPropertyValue("--raw-primary")
    ).toBe("");
    expect(
      document.documentElement.style.getPropertyValue("--raw-secondary")
    ).toBe("");
    expect(
      document.documentElement.style.getPropertyValue("--raw-background")
    ).toBe("");
  });

  it("maps presets to dark mode equivalents when dark class is present", () => {
    document.documentElement.classList.add("dark");
    // Apply Cobalt light colors
    applyCustomColors("#1e40af", "#dbeafe", "#f8faff");

    // Should map to cobalt dark colors
    expect(
      document.documentElement.style.getPropertyValue("--raw-primary")
    ).toBe("#3b82f6");
    expect(
      document.documentElement.style.getPropertyValue("--raw-secondary")
    ).toBe("#1e293b");
    expect(
      document.documentElement.style.getPropertyValue("--raw-background")
    ).toBe("#0b0f19");
  });

  it("retains custom background colors in dark mode", () => {
    document.documentElement.classList.add("dark");
    applyCustomColors("#112233", "#445566", "#121212");

    // Background should be preserved as-is
    expect(
      document.documentElement.style.getPropertyValue("--raw-background")
    ).toBe("#121212");
  });

  it("maps Ember dark sidebar without falling back to white", () => {
    document.documentElement.classList.add("dark");
    applyCustomColors("#e0531b", "#f1f3f5", "#faf8f5");
    applySidebarColor(DEFAULT_LIGHT_SIDEBAR);

    expect(
      document.documentElement.style.getPropertyValue("--raw-sidebar")
    ).toBe(DEFAULT_DARK_SIDEBAR);
  });

  it("maps Cobalt dark sidebar", () => {
    document.documentElement.classList.add("dark");
    applyCustomColors("#1e40af", "#dbeafe", "#f8faff");
    applySidebarColor("#1e40af");

    expect(
      document.documentElement.style.getPropertyValue("--raw-sidebar")
    ).toBe("#111827");
  });
});

describe("applySidebarColor", () => {
  beforeEach(() => {
    document.documentElement.classList.remove("dark");
    document.documentElement.style.removeProperty("--raw-sidebar");
    delete document.documentElement.dataset.rawPrimary;
    delete document.documentElement.dataset.rawSecondary;
    delete document.documentElement.dataset.rawBackground;
    delete document.documentElement.dataset.rawSidebar;
  });

  afterEach(() => {
    document.documentElement.classList.remove("dark");
    document.documentElement.style.removeProperty("--raw-sidebar");
    delete document.documentElement.dataset.rawPrimary;
    delete document.documentElement.dataset.rawSecondary;
    delete document.documentElement.dataset.rawBackground;
    delete document.documentElement.dataset.rawSidebar;
  });

  it("applies preset color IDs by mapping them to their HEX equivalents in light mode", () => {
    applySidebarColor("cobalt");
    expect(
      document.documentElement.style.getPropertyValue("--raw-sidebar")
    ).toBe("#1e40af");
  });

  it("clears the light default white so CSS :root owns --raw-sidebar", () => {
    applySidebarColor(DEFAULT_LIGHT_SIDEBAR);
    expect(
      document.documentElement.style.getPropertyValue("--raw-sidebar")
    ).toBe("");
  });

  it("maps preset sidebar colors to dark mode equivalents when dark class is present", () => {
    document.documentElement.classList.add("dark");
    // Apply Cobalt preset overall
    applyCustomColors("#1e40af", "#dbeafe", "#f8faff");
    applySidebarColor("#1e40af");

    expect(
      document.documentElement.style.getPropertyValue("--raw-sidebar")
    ).toBe("#111827");
  });

  it("retains custom dark sidebar colors in dark mode", () => {
    document.documentElement.classList.add("dark");
    applySidebarColor("#121212");

    // Sidebar should be preserved as-is
    expect(
      document.documentElement.style.getPropertyValue("--raw-sidebar")
    ).toBe("#121212");
  });

  it("clears white / default sidebar in dark mode for CSS canvas-family rail", () => {
    document.documentElement.classList.add("dark");
    applySidebarColor(DEFAULT_LIGHT_SIDEBAR);

    expect(
      document.documentElement.style.getPropertyValue("--raw-sidebar")
    ).toBe("");
  });

  it("preserves a custom branded rail on a preset in dark mode", () => {
    document.documentElement.classList.add("dark");
    applyCustomColors("#e0531b", "#f1f3f5", "#faf8f5");
    applySidebarColor("#6d28d9");

    expect(
      document.documentElement.style.getPropertyValue("--raw-sidebar")
    ).toBe("#6d28d9");
  });

  it("removes properties if values are defaults or empty", () => {
    document.documentElement.style.setProperty("--raw-sidebar", "#112233");
    applySidebarColor("default");
    expect(
      document.documentElement.style.getPropertyValue("--raw-sidebar")
    ).toBe("");
  });
});
