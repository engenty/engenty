import { describe, expect, it } from "vitest";
import { isSpaceDrivePending } from "./space-drive-pending";

const settled = {
  artifactsPending: false,
  dataRootsPending: false,
  enabled: true,
  projectsMounted: false,
  projectsPending: true,
  surfacePending: false,
};

describe("isSpaceDrivePending", () => {
  it("stays pending until the space id exists", () => {
    expect(
      isSpaceDrivePending({
        ...settled,
        enabled: false,
        projectsPending: true,
      })
    ).toBe(true);
  });

  it("does not wait on a disabled projects query when that module is not mounted", () => {
    expect(isSpaceDrivePending(settled)).toBe(false);
  });

  it("waits for the projects fetch once that module is mounted", () => {
    expect(
      isSpaceDrivePending({
        ...settled,
        projectsMounted: true,
        projectsPending: true,
      })
    ).toBe(true);
  });

  it("waits for the surface before deciding whether projects will load", () => {
    expect(
      isSpaceDrivePending({
        ...settled,
        surfacePending: true,
      })
    ).toBe(true);
  });

  it("waits for artifacts and data roots that are still in flight", () => {
    expect(
      isSpaceDrivePending({
        ...settled,
        artifactsPending: true,
      })
    ).toBe(true);
    expect(
      isSpaceDrivePending({
        ...settled,
        dataRootsPending: true,
      })
    ).toBe(true);
  });
});
