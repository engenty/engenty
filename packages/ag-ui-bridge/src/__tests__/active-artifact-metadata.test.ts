import { describe, expect, it } from "vitest";
import {
  ACTIVE_ARTIFACT_METADATA_KEY,
  mergeActiveArtifactMetadata,
  readActiveArtifactMetadata,
} from "../active-artifact-metadata.js";

describe("active artifact metadata", () => {
  it("merges an artifact id into metadata under the dedicated key", () => {
    const next = mergeActiveArtifactMetadata(
      { source: "test" },
      { artifactId: "artifact-1", shownAt: "2026-08-06T00:00:00.000Z" }
    );
    expect(next).toEqual({
      source: "test",
      [ACTIVE_ARTIFACT_METADATA_KEY]: {
        artifact_id: "artifact-1",
        shown_at: "2026-08-06T00:00:00.000Z",
      },
    });
  });

  it("does not touch unrelated keys — HITL keys survive the merge", () => {
    const next = mergeActiveArtifactMetadata(
      { ag_ui_open_interrupt: { kind: "decision" } },
      { artifactId: "artifact-1", shownAt: "2026-08-06T00:00:00.000Z" }
    );
    expect(next.ag_ui_open_interrupt).toEqual({ kind: "decision" });
  });

  it("clears the key when artifactId is null", () => {
    const withKey = mergeActiveArtifactMetadata(
      {},
      { artifactId: "artifact-1", shownAt: "2026-08-06T00:00:00.000Z" }
    );
    const cleared = mergeActiveArtifactMetadata(withKey, {
      artifactId: null,
      shownAt: "2026-08-06T00:01:00.000Z",
    });
    expect(cleared).toEqual({});
  });

  it("reads a well-formed active artifact back", () => {
    expect(
      readActiveArtifactMetadata({
        [ACTIVE_ARTIFACT_METADATA_KEY]: {
          artifact_id: "artifact-1",
          shown_at: "2026-08-06T00:00:00.000Z",
        },
      })
    ).toEqual({
      artifact_id: "artifact-1",
      shown_at: "2026-08-06T00:00:00.000Z",
    });
  });

  it("returns null for missing, malformed, or absent metadata", () => {
    expect(readActiveArtifactMetadata(null)).toBeNull();
    expect(readActiveArtifactMetadata({})).toBeNull();
    expect(
      readActiveArtifactMetadata({
        [ACTIVE_ARTIFACT_METADATA_KEY]: { artifact_id: "" },
      })
    ).toBeNull();
    expect(
      readActiveArtifactMetadata({
        [ACTIVE_ARTIFACT_METADATA_KEY]: "not-an-object",
      })
    ).toBeNull();
  });
});
