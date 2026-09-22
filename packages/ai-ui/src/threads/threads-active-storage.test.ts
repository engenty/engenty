/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it } from "vitest";
import { ENGENTY_COPILOT_HOST_KEY } from "../agent-provider/host-keys.js";
import {
  readActiveThreadIdForHost,
  writeActiveThreadIdForHost,
} from "./threads-active-storage.js";

const SESSION_A = "11111111-1111-4111-8111-111111111111";
const SESSION_B = "22222222-2222-4222-8222-222222222222";
const MAP_KEY = "engenty:threads:active";

describe("threads-active-storage", () => {
  afterEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("round-trips active thread ids per host in the threads map", () => {
    writeActiveThreadIdForHost(ENGENTY_COPILOT_HOST_KEY, SESSION_A);
    expect(readActiveThreadIdForHost(ENGENTY_COPILOT_HOST_KEY)).toBe(SESSION_A);
    expect(window.localStorage.getItem(MAP_KEY)).toContain(SESSION_A);

    writeActiveThreadIdForHost(ENGENTY_COPILOT_HOST_KEY, null);
    expect(readActiveThreadIdForHost(ENGENTY_COPILOT_HOST_KEY)).toBeNull();
  });

  it("rejects non-UUID values", () => {
    writeActiveThreadIdForHost(ENGENTY_COPILOT_HOST_KEY, "not-a-uuid");
    expect(readActiveThreadIdForHost(ENGENTY_COPILOT_HOST_KEY)).toBeNull();
  });

  it("writes to sessionStorage (per-tab authoritative) and localStorage (seed)", () => {
    writeActiveThreadIdForHost(ENGENTY_COPILOT_HOST_KEY, SESSION_A);
    expect(window.sessionStorage.getItem(MAP_KEY)).toContain(SESSION_A);
    expect(window.localStorage.getItem(MAP_KEY)).toContain(SESSION_A);
  });

  it("new tab seeds once from localStorage, then ignores later shared writes", () => {
    // Another tab persisted SESSION_A into the shared map; this tab has no
    // sessionStorage entry yet (fresh tab).
    window.localStorage.setItem(
      MAP_KEY,
      JSON.stringify({ [ENGENTY_COPILOT_HOST_KEY]: SESSION_A })
    );

    // First read seeds and pins SESSION_A for this tab.
    expect(readActiveThreadIdForHost(ENGENTY_COPILOT_HOST_KEY)).toBe(SESSION_A);
    expect(window.sessionStorage.getItem(MAP_KEY)).toContain(SESSION_A);

    // Another tab retargets the shared map — this tab must stay on SESSION_A.
    window.localStorage.setItem(
      MAP_KEY,
      JSON.stringify({ [ENGENTY_COPILOT_HOST_KEY]: SESSION_B })
    );
    expect(readActiveThreadIdForHost(ENGENTY_COPILOT_HOST_KEY)).toBe(SESSION_A);
  });

  it("per-tab binding survives shared-map writes from this tab's other hosts", () => {
    writeActiveThreadIdForHost(ENGENTY_COPILOT_HOST_KEY, SESSION_A);
    writeActiveThreadIdForHost("other:host", SESSION_B);
    expect(readActiveThreadIdForHost(ENGENTY_COPILOT_HOST_KEY)).toBe(SESSION_A);
    expect(readActiveThreadIdForHost("other:host")).toBe(SESSION_B);
  });

  it("explicit clear does not fall back to the localStorage seed", () => {
    window.localStorage.setItem(
      MAP_KEY,
      JSON.stringify({ [ENGENTY_COPILOT_HOST_KEY]: SESSION_A })
    );
    expect(readActiveThreadIdForHost(ENGENTY_COPILOT_HOST_KEY)).toBe(SESSION_A);

    writeActiveThreadIdForHost(ENGENTY_COPILOT_HOST_KEY, null);
    // Even though another tab may have re-populated the shared map, a cleared
    // tab stays cleared.
    window.localStorage.setItem(
      MAP_KEY,
      JSON.stringify({ [ENGENTY_COPILOT_HOST_KEY]: SESSION_B })
    );
    expect(readActiveThreadIdForHost(ENGENTY_COPILOT_HOST_KEY)).toBeNull();
  });
});
