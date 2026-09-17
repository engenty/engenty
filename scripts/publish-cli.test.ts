import { describe, expect, it } from "vitest";
import {
  publicImageNames,
  transformCliManifestForPublish,
} from "./publish-cli.mjs";

describe("publish-cli", () => {
  it("publishes the workspace package as `engenty` at the release version, without workspace deps", () => {
    const out = transformCliManifestForPublish(
      {
        name: "@engenty/cli",
        version: "0.0.1",
        private: true,
        description: "d",
        bin: { engenty: "./dist/bin.js" },
        files: ["dist"],
        engines: { node: ">=22" },
        dependencies: {
          "@engenty/environment": "workspace:*",
          commander: "^15.0.0",
        },
        devDependencies: { tsup: "^8" },
      },
      { version: "0.2.3", repository: "https://github.com/engenty/engenty.git" }
    );
    expect(out.name).toBe("engenty");
    expect(out.version).toBe("0.2.3");
    expect(out.private).toBeUndefined();
    expect(out.devDependencies).toBeUndefined();
    expect(out.dependencies).toEqual({ commander: "^15.0.0" });
    expect(out.publishConfig).toEqual({ access: "public" });
    expect(out.bin).toEqual({ engenty: "dist/bin.js" });
  });

  it("rewrites the pro image names to the public ones", () => {
    expect(
      publicImageNames("image: ghcr.io/engenty/engenty-pro-edge:latest")
    ).toBe("image: ghcr.io/engenty/engenty-edge:latest");
  });
});
