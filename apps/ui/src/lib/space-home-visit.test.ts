/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it } from "vitest";
import {
  holdSpaceHomeVisit,
  type SpaceHomeVisit,
  spaceHomeCursorKey,
} from "./space-home-visit";

const SPACE_A = "space-engrd";
const SPACE_B = "space-matthias";
const CURSOR_A = "2026-09-01T00:00:00.000Z";
const CURSOR_B = "2026-09-21T12:00:00.000Z";

afterEach(() => {
  window.localStorage.removeItem(spaceHomeCursorKey(SPACE_A));
  window.localStorage.removeItem(spaceHomeCursorKey(SPACE_B));
});

function store(spaceId: string, cursor: string): void {
  window.localStorage.setItem(spaceHomeCursorKey(spaceId), cursor);
}

describe("holdSpaceHomeVisit", () => {
  it("reads the stored cursor on the first visit to a space", () => {
    store(SPACE_A, CURSOR_A);
    expect(holdSpaceHomeVisit(SPACE_A, null)).toEqual({
      since: CURSOR_A,
      spaceId: SPACE_A,
    });
  });

  it("does not send the previous space's since when switching spaces", () => {
    store(SPACE_A, CURSOR_A);
    store(SPACE_B, CURSOR_B);
    const onA: SpaceHomeVisit = holdSpaceHomeVisit(SPACE_A, null);
    const onB = holdSpaceHomeVisit(SPACE_B, onA);
    expect(onB).toEqual({ since: CURSOR_B, spaceId: SPACE_B });
    expect(onB.since).not.toBe(onA.since);
  });

  it("uses a null since for a new space, not the previous space's cursor", () => {
    store(SPACE_A, CURSOR_A);
    const onA = holdSpaceHomeVisit(SPACE_A, null);
    const onB = holdSpaceHomeVisit(SPACE_B, onA);
    expect(onB).toEqual({ since: null, spaceId: SPACE_B });
  });

  it("freezes the cursor for the rest of the visit", () => {
    store(SPACE_A, CURSOR_A);
    const visit = holdSpaceHomeVisit(SPACE_A, null);
    store(SPACE_A, CURSOR_B);
    expect(holdSpaceHomeVisit(SPACE_A, visit)).toBe(visit);
    expect(holdSpaceHomeVisit(SPACE_A, visit).since).toBe(CURSOR_A);
  });
});
