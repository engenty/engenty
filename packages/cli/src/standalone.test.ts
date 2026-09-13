import { describe, expect, it } from "vitest";
import { defaultRef, tarballUrl } from "./create/create-commands.js";
import { readEnvFileValue } from "./deploy/migrate.js";
import { checkNode } from "./doctor/host-checks.js";
import { resolveInvocation } from "./standalone.js";

describe("resolveInvocation", () => {
  it("delegates every command to the checkout it runs in", () => {
    expect(resolveInvocation(["doctor"], "/repo")).toEqual({
      kind: "delegate",
      root: "/repo",
    });
    expect(resolveInvocation(["db", "up"], "/repo").kind).toBe("delegate");
  });

  it("never nests checkouts: create stays standalone inside one", () => {
    expect(resolveInvocation(["create", "x"], "/repo").kind).toBe("standalone");
  });

  it("is standalone outside a checkout", () => {
    expect(resolveInvocation(["deploy"], null).kind).toBe("standalone");
  });
});

describe("create", () => {
  it("clones the release the package is", () => {
    expect(defaultRef("0.2.2")).toBe("v0.2.2");
  });

  it("builds the codeload URL for GitHub repos only", () => {
    expect(tarballUrl("https://github.com/engenty/engenty.git", "v0.2.2")).toBe(
      "https://codeload.github.com/engenty/engenty/tar.gz/refs/tags/v0.2.2"
    );
    expect(tarballUrl("git@github.com:engenty/engenty.git", "main")).toBe(
      "https://codeload.github.com/engenty/engenty/tar.gz/refs/heads/main"
    );
    expect(tarballUrl("https://example.com/x.git", "main")).toBeNull();
  });
});

describe("host checks", () => {
  it("grades the Node version", () => {
    expect(checkNode("v20.1.0").status).toBe("fail");
    expect(checkNode("v22.18.0").status).toBe("warn");
    expect(checkNode("v24.14.0").status).toBe("ok");
  });
});

describe("readEnvFileValue", () => {
  it("returns undefined for a missing file", () => {
    expect(readEnvFileValue("/nonexistent/.env", "SUPABASE_DB_URL")).toBe(
      undefined
    );
  });
});
