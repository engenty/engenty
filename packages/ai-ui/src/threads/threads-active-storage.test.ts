/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it } from "vitest";
import { ENGENTY_COPILOT_HOST_KEY } from "../agent-provider/host-keys.js";
import {
  readActiveThreadIdForHost,
  writeActiveThreadIdForHost,
} from "./threads-active-storage.js";

const SESSION_A = "11111111-1111-4111-8111-111111111111";
const MAP_KEY = "engenty:threads:active";

describe("threads-active-storage", () => {
  afterEach(() => {
    window.localStorage.clear();
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
});
