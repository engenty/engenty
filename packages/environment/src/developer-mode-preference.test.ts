/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ENGENTY_DEVELOPER_MODE_STORAGE_KEY,
  getDeveloperModePreference,
  setDeveloperModePreference,
  subscribeDeveloperModePreference,
} from "./developer-mode-preference.js";

describe("developer mode preference", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("stores and reads preference", () => {
    expect(getDeveloperModePreference()).toBe(false);
    setDeveloperModePreference(true);
    expect(getDeveloperModePreference()).toBe(true);
    expect(localStorage.getItem(ENGENTY_DEVELOPER_MODE_STORAGE_KEY)).toBe("1");
    setDeveloperModePreference(false);
    expect(getDeveloperModePreference()).toBe(false);
  });

  it("notifies subscribers on change", () => {
    const spy = vi.fn();
    const unsub = subscribeDeveloperModePreference(spy);
    setDeveloperModePreference(true);
    expect(spy).toHaveBeenCalledTimes(1);
    unsub();
    setDeveloperModePreference(false);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
