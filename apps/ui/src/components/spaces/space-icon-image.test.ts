import { describe, expect, it } from "vitest";
import {
  SPACE_ICON_IMAGE_MAX_CHARS,
  spaceIconFromImageFile,
} from "./space-icon-image";

describe("spaceIconFromImageFile", () => {
  it("rejects non-images before touching a canvas", async () => {
    const file = new File(["hello"], "notes.txt", { type: "text/plain" });
    await expect(spaceIconFromImageFile(file)).rejects.toThrow("not-image");
  });

  it("keeps the stored data URL under the API ceiling", () => {
    expect(SPACE_ICON_IMAGE_MAX_CHARS).toBe(24_000);
  });
});
