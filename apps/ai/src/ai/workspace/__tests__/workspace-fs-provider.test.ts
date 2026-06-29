import { afterEach, describe, expect, it } from "vitest";
import {
  resolveEngentyWorkspaceFsProvider,
  resolveWorkspaceStorageBucket,
} from "../workspace-fs-provider.js";

describe("workspace-fs-provider", () => {
  afterEach(() => {
    delete process.env.ENGENTY_WORKSPACE_FS_PROVIDER;
    delete process.env.ENGENTY_WORKSPACE_STORAGE_BUCKET;
  });

  it("defaults to supabase provider", () => {
    delete process.env.ENGENTY_WORKSPACE_FS_PROVIDER;
    expect(resolveEngentyWorkspaceFsProvider()).toBe("supabase");
  });

  it("accepts explicit supabase provider", () => {
    process.env.ENGENTY_WORKSPACE_FS_PROVIDER = "supabase";
    expect(resolveEngentyWorkspaceFsProvider()).toBe("supabase");
  });

  it("rejects unknown providers", () => {
    process.env.ENGENTY_WORKSPACE_FS_PROVIDER = "s3";
    expect(() => resolveEngentyWorkspaceFsProvider()).toThrow(
      "unsupported_engenty_workspace_fs_provider:s3"
    );
  });

  it("defaults workspace storage bucket to files", () => {
    delete process.env.ENGENTY_WORKSPACE_STORAGE_BUCKET;
    expect(resolveWorkspaceStorageBucket()).toBe("files");
  });
});
