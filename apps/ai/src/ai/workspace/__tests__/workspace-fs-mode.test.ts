import { afterEach, describe, expect, it } from "vitest";
import {
  resolveEngentyWorkspaceFsMode,
  shouldUseRemoteWorkspaceSync,
} from "../workspace-fs-mode.js";

describe("workspace-fs-mode", () => {
  afterEach(() => {
    delete process.env.ENGENTY_WORKSPACE_FS;
  });

  it("defaults to remote (prod-aligned)", () => {
    delete process.env.ENGENTY_WORKSPACE_FS;
    expect(resolveEngentyWorkspaceFsMode()).toBe("remote");
  });

  it("accepts legacy file-storage alias as remote", () => {
    process.env.ENGENTY_WORKSPACE_FS = "file-storage";
    expect(resolveEngentyWorkspaceFsMode()).toBe("remote");
  });

  it("opts into local mirrors only when ENGENTY_WORKSPACE_FS=local", () => {
    process.env.ENGENTY_WORKSPACE_FS = "local";
    expect(resolveEngentyWorkspaceFsMode()).toBe("local");
  });

  it("enables sandbox sync when remote mode and bearer access are present", () => {
    expect(
      shouldUseRemoteWorkspaceSync({
        fileStorageAccess: {
          coreBaseUrl: "http://127.0.0.1:8787",
          userAccessToken: "token",
        },
        mode: "remote",
      })
    ).toBe(true);
  });

  it("skips sandbox sync in local mode even with bearer access", () => {
    expect(
      shouldUseRemoteWorkspaceSync({
        fileStorageAccess: {
          coreBaseUrl: "http://127.0.0.1:8787",
          userAccessToken: "token",
        },
        mode: "local",
      })
    ).toBe(false);
  });
});
