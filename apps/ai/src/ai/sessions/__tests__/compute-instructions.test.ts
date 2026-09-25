import { describe, expect, it } from "vitest";

import type { EngentyWorkspaceMountSpec } from "../../workspace/contracts.js";
import { buildComputeInstructions } from "../compute-instructions.js";

// The block tells a bot which paths its shell has. Ways this can fail: it
// names a path the container does not bind (the bot runs `cat /home/x` on a
// space computer and reads nothing), or it hides a path that is bound.
const mounts: EngentyWorkspaceMountSpec[] = [
  {
    fileStorageRelativePath: "ai/workspace/commons/",
    mountPath: "/space",
    spaceId: "space-1",
  },
  { fileStorageRelativePath: "ai/home/agent-1/", mountPath: "/home" },
  {
    fileStorageRelativePath: "data",
    kind: "data",
    mountPath: "/data",
    spaceId: "space-1",
  },
  {
    fileStorageRelativePath: "ai/skills/",
    mountPath: "/skills",
    readOnly: true,
  },
];

function line(block: string, prefix: string): string {
  return block.split("\n").find((l) => l.startsWith(prefix)) ?? "";
}

describe("buildComputeInstructions", () => {
  it("on a space computer, /home, /data and /skills are file tools only", () => {
    const block = buildComputeInstructions({
      lifecycle: "space",
      mounts,
      network: "none",
    });
    const reach = line(block, "- Your commands start in /sandbox");
    const fileOnly = line(block, "- Not on this computer");
    expect(reach).toContain("/space");
    for (const path of ["/home", "/data", "/skills"]) {
      expect(fileOnly).toContain(path);
      expect(reach).not.toContain(path);
    }
    expect(block).toContain("$HOME (/opt/sandbox)");
  });

  it("in a per-run sandbox, /home and /data are on the computer", () => {
    const block = buildComputeInstructions({
      lifecycle: "run",
      mounts,
      network: "none",
    });
    const reach = line(block, "- Your commands start in /sandbox");
    expect(reach).toContain("/home");
    expect(reach).toContain("/data");
    expect(line(block, "- Not on this computer")).toBe(
      "- Not on this computer, file tools only: /skills. Copy a file to /sandbox to run it."
    );
  });
});
