import { describe, expect, it } from "vitest";
import { personalSpaceKey, resolveCopilotSpaceId } from "./copilot-space";

const SPACES = [
  { id: "space-company", isPersonal: false, key: "company" },
  { id: "space-marketing", isPersonal: false, key: "marketing" },
  { id: "space-mine", isPersonal: true, key: "matthias" },
];

describe("resolveCopilotSpaceId", () => {
  it("uses the space in the URL", () => {
    expect(
      resolveCopilotSpaceId({
        pathname: "/s/marketing/engenty-copilot/chat",
        spaces: SPACES,
      })
    ).toBe("space-marketing");
  });

  it("binds to the personal space outside any space route", () => {
    // The drawer opens on global pages too. The tenant default is Company —
    // shared with everyone — so falling back there would file a private thought
    // in a shared history.
    for (const pathname of [
      "/mdl/engenty-copilot/chat",
      "/mdl/inbox",
      "/settings/profile",
      "/setup",
    ]) {
      expect(resolveCopilotSpaceId({ pathname, spaces: SPACES })).toBe(
        "space-mine"
      );
    }
  });

  it("falls back to personal for a space key that does not resolve", () => {
    expect(
      resolveCopilotSpaceId({
        pathname: "/s/deleted-space/engenty-copilot/chat",
        spaces: SPACES,
      })
    ).toBe("space-mine");
  });

  it("returns null rather than guessing when there is no personal space", () => {
    // A user whose row predates the Phase P backfill. The thread is then
    // created space-less, which is honest: it shows under "All spaces".
    expect(
      resolveCopilotSpaceId({
        pathname: "/mdl/inbox",
        spaces: SPACES.filter((space) => !space.isPersonal),
      })
    ).toBeNull();
  });

  it("does not treat the /s/me alias as a real key", () => {
    // Observed live: `/s/me/engenty-copilot/chat/<id>` out-ranks the `/s/me/*`
    // splat, so the alias reached the shell as a literal space key — which no
    // space has. The chat opened against the tenant default and its own history
    // list came back empty.
    // It DOES survive to a rendered route, which is the finding above. No space
    // carries the key `me`, so resolution must not match on it — and the
    // personal fallback happens to be the same answer the alias stands for,
    // which is why the chat still opened in roughly the right place and the
    // wrongness showed up only in the empty history list.
    expect(
      resolveCopilotSpaceId({
        pathname: "/s/me/engenty-copilot",
        spaces: SPACES,
      })
    ).toBe("space-mine");
  });
});

describe("personalSpaceKey", () => {
  it("returns the key so a deep link can name a real space", () => {
    expect(personalSpaceKey(SPACES)).toBe("matthias");
  });

  it("returns null when the viewer has no personal space", () => {
    expect(personalSpaceKey(SPACES.filter((s) => !s.isPersonal))).toBeNull();
  });
});
