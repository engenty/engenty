import { spawnSync } from "node:child_process";

export function runPnpmCommand(params: {
  args: readonly string[];
  cwd: string;
}): { ok: boolean; output: string } {
  const result = spawnSync("pnpm", [...params.args], {
    cwd: params.cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  return {
    ok: result.status === 0,
    output,
  };
}
