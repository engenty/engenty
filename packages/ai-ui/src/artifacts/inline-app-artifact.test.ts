import { describe, expect, it } from "vitest";
import {
  readAppBuildArtifactId,
  readDelegatedAppArtifactId,
} from "./inline-app-artifact.js";

describe("readAppBuildArtifactId", () => {
  const built = {
    app_id: "00000000-0000-0000-0000-000000000001",
    artifact_id: "art-1",
    next_step: "…",
    status: "built",
  };

  it("recognizes a built app_build result", () => {
    expect(readAppBuildArtifactId(built)).toBe("art-1");
    expect(readAppBuildArtifactId({ ...built, status: "published" })).toBe(
      "art-1"
    );
  });

  it("ignores failed builds and unrelated outputs", () => {
    expect(readAppBuildArtifactId({ ...built, status: "build_failed" })).toBe(
      null
    );
    expect(readAppBuildArtifactId({ result: "text" })).toBe(null);
    expect(readAppBuildArtifactId(null)).toBe(null);
    expect(readAppBuildArtifactId([built])).toBe(null);
  });
});

describe("readDelegatedAppArtifactId", () => {
  it("reads the delegate tool's marker", () => {
    expect(
      readDelegatedAppArtifactId({
        agent: "app_coder",
        app_artifact_id: "art-2",
        ok: true,
        result: "done",
      })
    ).toBe("art-2");
  });

  it("returns null when the child built nothing", () => {
    expect(
      readDelegatedAppArtifactId({ agent: "cli", ok: true, result: "done" })
    ).toBe(null);
    expect(readDelegatedAppArtifactId(undefined)).toBe(null);
  });
});
