import { describe, expect, it } from "vitest";
import { diffScope, generatableGaps, requiredGaps } from "./env-diff.js";
import { parseEnvDocument } from "./env-file-document.js";
import type { EnvVarSpec } from "./env-manifest-types.js";

const SPECS: EnvVarSpec[] = [
  {
    description: "Required secret",
    group: "G",
    key: "REQ",
    obtain: { kind: "generate", generator: "base64url-48" },
    required: "always",
    scopes: ["root"],
    secret: true,
    validate: (value) => (value.length >= 8 ? undefined : "too short"),
  },
  {
    description: "Has placeholder",
    exampleValue: "sb_secret_...",
    group: "G",
    key: "PLACEHOLDER",
    obtain: { kind: "manual" },
    required: "always",
    scopes: ["root"],
    secret: false,
  },
  {
    description: "Optional",
    group: "G",
    key: "OPT",
    obtain: { kind: "manual" },
    required: "optional",
    scopes: ["root"],
    secret: false,
  },
  {
    description: "Portless owned",
    group: "Portless",
    key: "ENGENTY_API_BASE_URL",
    obtain: { kind: "portless" },
    required: "optional",
    scopes: ["root"],
    secret: false,
  },
];

describe("diffScope", () => {
  it("reports missing file as all-missing", () => {
    const report = diffScope({ doc: null, scope: "root", specs: SPECS });
    expect(report.fileExists).toBe(false);
    expect(report.vars.every((v) => v.status === "missing")).toBe(true);
  });

  it("classifies ok / empty / placeholder / invalid / missing", () => {
    const doc = parseEnvDocument(
      ["REQ=longenoughvalue", "PLACEHOLDER=sb_secret_...", "OPT="].join("\n")
    );
    const report = diffScope({ doc, scope: "root", specs: SPECS });
    const byKey = new Map(report.vars.map((v) => [v.spec.key, v]));
    expect(byKey.get("REQ")?.status).toBe("ok");
    expect(byKey.get("PLACEHOLDER")?.status).toBe("placeholder");
    expect(byKey.get("OPT")?.status).toBe("empty");
    expect(byKey.get("ENGENTY_API_BASE_URL")?.status).toBe("missing");
  });

  it("flags validator failures as invalid", () => {
    const doc = parseEnvDocument("REQ=short\n");
    const report = diffScope({ doc, scope: "root", specs: SPECS });
    const req = report.vars.find((v) => v.spec.key === "REQ");
    expect(req?.status).toBe("invalid");
    expect(req?.error).toBe("too short");
  });

  it("lists unknown keys as extras without deleting them", () => {
    const doc = parseEnvDocument("UNKNOWN_KEY=1\nREQ=longenoughvalue\n");
    const report = diffScope({ doc, scope: "root", specs: SPECS });
    expect(report.extras).toEqual(["UNKNOWN_KEY"]);
  });

  it("requiredGaps excludes portless-kind and ok vars", () => {
    const doc = parseEnvDocument("REQ=longenoughvalue\n");
    const report = diffScope({ doc, scope: "root", specs: SPECS });
    const gaps = requiredGaps(report);
    expect(gaps.map((g) => g.spec.key)).toEqual(["PLACEHOLDER"]);
  });

  it("generatableGaps returns unset generate-kind vars", () => {
    const doc = parseEnvDocument("PLACEHOLDER=real-value\n");
    const report = diffScope({ doc, scope: "root", specs: SPECS });
    expect(generatableGaps(report).map((g) => g.spec.key)).toEqual(["REQ"]);
  });

  it("resolves a per-scope requirement against the scope being diffed", () => {
    const perScope: EnvVarSpec[] = [
      {
        description: "Required in one file, an override in the other",
        group: "G",
        key: "SCOPED",
        obtain: { kind: "manual" },
        required: { deploy: "optional", root: "always" },
        scopes: ["root", "deploy"],
        secret: false,
      },
    ];
    const empty = parseEnvDocument("");

    expect(
      requiredGaps(
        diffScope({ doc: empty, scope: "root", specs: perScope })
      ).map((g) => g.spec.key)
    ).toEqual(["SCOPED"]);
    expect(
      requiredGaps(diffScope({ doc: empty, scope: "deploy", specs: perScope }))
    ).toEqual([]);
  });
});
