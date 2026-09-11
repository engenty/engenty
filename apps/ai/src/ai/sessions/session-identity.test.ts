import { describe, expect, it } from "vitest";
import { spaceIdFromRouteContext } from "./session-identity.js";

const SPACE = "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";

describe("spaceIdFromRouteContext", () => {
  it("reads the space the UI put in scope", () => {
    expect(
      spaceIdFromRouteContext({
        moduleId: "engenty-copilot",
        scope: { space_id: SPACE, ui_language: "de" },
      })
    ).toBe(SPACE);
  });

  it("returns null when there is no scope at all", () => {
    expect(spaceIdFromRouteContext(undefined)).toBeNull();
    expect(spaceIdFromRouteContext({})).toBeNull();
    expect(spaceIdFromRouteContext({ scope: null })).toBeNull();
  });

  it("drops anything that is not a uuid instead of handing it to Postgres", () => {
    // The column is `uuid`, so a non-uuid does not degrade to a wrong space —
    // it fails the insert and takes the whole chat creation with it. A chat
    // that cannot be created is a far worse outcome than one with no space.
    for (const bad of ["", "  ", "me", "company", "not-a-uuid", `${SPACE}x`]) {
      expect(spaceIdFromRouteContext({ scope: { space_id: bad } })).toBeNull();
    }
  });

  it("ignores a non-string space_id", () => {
    // `scope` is a free-form record from the client; nothing stops it sending
    // a number or an object here.
    for (const bad of [42, true, {}, [SPACE], null]) {
      expect(spaceIdFromRouteContext({ scope: { space_id: bad } })).toBeNull();
    }
  });

  it("tolerates surrounding whitespace", () => {
    expect(spaceIdFromRouteContext({ scope: { space_id: ` ${SPACE} ` } })).toBe(
      SPACE
    );
  });
});
