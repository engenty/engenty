import { describe, expect, it, vi } from "vitest";

vi.mock("./desktop-fs.js", () => ({
  isDesktopShell: vi.fn(() => false),
  listDesktopDirectoryKeys: vi.fn(() => []),
}));

vi.mock("./handle-store.js", () => ({
  listHandleKeys: vi.fn(async () => []),
}));

import { isDesktopShell, listDesktopDirectoryKeys } from "./desktop-fs.js";
import { listHandleKeys } from "./handle-store.js";
import { hasServableLocalFolder } from "./servable-folders.js";

describe("hasServableLocalFolder", () => {
  it("is false when this browser holds no folder handle", async () => {
    vi.mocked(isDesktopShell).mockReturnValue(false);
    vi.mocked(listHandleKeys).mockResolvedValue([]);
    await expect(hasServableLocalFolder()).resolves.toBe(false);
  });

  it("is true when IndexedDB has a granted handle", async () => {
    vi.mocked(isDesktopShell).mockReturnValue(false);
    vi.mocked(listHandleKeys).mockResolvedValue(["conn-1"]);
    await expect(hasServableLocalFolder()).resolves.toBe(true);
  });

  it("is true in the desktop shell when a path was granted", async () => {
    vi.mocked(isDesktopShell).mockReturnValue(true);
    vi.mocked(listDesktopDirectoryKeys).mockReturnValue(["conn-2"]);
    await expect(hasServableLocalFolder()).resolves.toBe(true);
  });
});
