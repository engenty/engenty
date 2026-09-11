/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it } from "vitest";
import { ENGENTY_COPILOT_HOST_KEY } from "../agent-provider/host-keys.js";
import { resolveEngentyThreadHostProfile } from "./thread-host-profile.js";
import {
  activeThreadStorageKey,
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

describe("space-scoped active threads", () => {
  afterEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  const SPACE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const SPACE_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

  it("leaves the bare host key alone when there is no space", () => {
    expect(activeThreadStorageKey(ENGENTY_COPILOT_HOST_KEY)).toBe(
      ENGENTY_COPILOT_HOST_KEY
    );
    expect(activeThreadStorageKey(ENGENTY_COPILOT_HOST_KEY, null)).toBe(
      ENGENTY_COPILOT_HOST_KEY
    );
    expect(activeThreadStorageKey(ENGENTY_COPILOT_HOST_KEY, "  ")).toBe(
      ENGENTY_COPILOT_HOST_KEY
    );
  });

  it("keeps one active thread PER SPACE — the whole point", () => {
    // The bug this exists for: open the dock in Marketing, resume Company's
    // thread, and the run reads Company's tools because the space comes off
    // the thread row.
    writeActiveThreadIdForHost(
      activeThreadStorageKey(ENGENTY_COPILOT_HOST_KEY, SPACE_A),
      SESSION_A
    );
    writeActiveThreadIdForHost(
      activeThreadStorageKey(ENGENTY_COPILOT_HOST_KEY, SPACE_B),
      SESSION_B
    );

    expect(
      readActiveThreadIdForHost(
        activeThreadStorageKey(ENGENTY_COPILOT_HOST_KEY, SPACE_A)
      )
    ).toBe(SESSION_A);
    expect(
      readActiveThreadIdForHost(
        activeThreadStorageKey(ENGENTY_COPILOT_HOST_KEY, SPACE_B)
      )
    ).toBe(SESSION_B);
  });

  it("answers nothing for a space that has no chat yet", () => {
    writeActiveThreadIdForHost(
      activeThreadStorageKey(ENGENTY_COPILOT_HOST_KEY, SPACE_A),
      SESSION_A
    );
    expect(
      readActiveThreadIdForHost(
        activeThreadStorageKey(ENGENTY_COPILOT_HOST_KEY, SPACE_B)
      )
    ).toBeNull();
  });

  it("marks the copilot space-bound and nothing else", () => {
    // The provider only narrows the key for hosts that say so; a desk host
    // already carries its space IN the host key.
    expect(
      resolveEngentyThreadHostProfile(ENGENTY_COPILOT_HOST_KEY).spaceBound
    ).toBe(true);
    expect(
      resolveEngentyThreadHostProfile(`agent-desk:${SPACE_A}:analyst`)
        .spaceBound
    ).toBeFalsy();
    expect(resolveEngentyThreadHostProfile("kb:search").spaceBound).toBeFalsy();
  });
});
