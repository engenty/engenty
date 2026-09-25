import { type ChildProcess, spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import {
  answerRelayRequest,
  issueTicketForTests,
} from "../engenty-cli-relay.js";

// `engenty` in a sandbox shell. Ways it can fail: a ticket works from another
// container, or after its command ended — a program acts as a run it is not;
// the container script loses output or the exit code on the way back (a
// piped `| jq` sees half a JSON document, an approval stop looks like
// success); `--input @file` is sent as the literal "@file" because the file
// only exists in the container.

const SCRIPT = fileURLToPath(
  new URL("../../../../../../deploy/sandbox/engenty.mjs", import.meta.url)
);

describe("answerRelayRequest", () => {
  const run = async (argv: readonly string[]) => ({
    exitCode: 0,
    stderr: "",
    stdout: argv.join(" "),
  });

  it("answers only in the container the ticket was issued for, while it lives", async () => {
    const close = issueTicketForTests("t1", {
      run,
      sandboxId: "engenty-space-a",
    });
    const request = { argv: ["tools", "list"], ticket: "t1" };
    expect(await answerRelayRequest("engenty-space-a", request)).toMatchObject({
      exitCode: 0,
      stdout: "tools list",
    });
    expect(
      (await answerRelayRequest("engenty-space-b", request)).exitCode
    ).toBe(1);
    close();
    expect(
      (await answerRelayRequest("engenty-space-a", request)).exitCode
    ).toBe(1);
  });
});

describe("deploy/sandbox/engenty.mjs", () => {
  let relay: ChildProcess | null = null;
  afterEach(() => {
    relay?.kill();
    relay = null;
  });

  /** The relay, answered by `respond` the way apps/ai answers it. */
  function startRelay(
    respond: (request: { argv: string[]; ticket: string }) => {
      exitCode: number;
      stderr: string;
      stdout: string;
    }
  ): Promise<string> {
    const child = spawn(process.execPath, [SCRIPT, "relay"]);
    relay = child;
    return new Promise((resolve) => {
      let buffer = "";
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        buffer += chunk;
        let cut = buffer.indexOf("\n");
        while (cut >= 0) {
          const frame = JSON.parse(buffer.slice(0, cut));
          buffer = buffer.slice(cut + 1);
          cut = buffer.indexOf("\n");
          if (frame.type === "ready") {
            resolve(frame.socket);
          } else {
            child.stdin.write(
              `${JSON.stringify({ id: frame.id, ...respond(frame.request) })}\n`
            );
          }
        }
      });
    });
  }

  function runClient(args: string[], env: Record<string, string>) {
    return new Promise<{ code: number | null; stderr: string; stdout: string }>(
      (resolve) => {
        const child = spawn(process.execPath, [SCRIPT, ...args], {
          env: { PATH: process.env.PATH ?? "", ...env },
        });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (c) => {
          stdout += c;
        });
        child.stderr.on("data", (c) => {
          stderr += c;
        });
        child.on("close", (code) => resolve({ code, stderr, stdout }));
      }
    );
  }

  it("carries argv, the ticket and the file behind --input @, and brings back all output and the exit code", async () => {
    const big = "x".repeat(300_000);
    let seen: { argv: string[]; ticket: string } | null = null;
    const socket = await startRelay((request) => {
      seen = request;
      return { exitCode: 2, stderr: "needs approval\n", stdout: big };
    });
    const dir = mkdtempSync(path.join(tmpdir(), "engenty-cli-"));
    writeFileSync(path.join(dir, "draft.json"), '{"status":"draft"}');

    const result = await runClient(
      ["tools", "call", "invoices_create", "--input", `@${dir}/draft.json`],
      { ENGENTY_RUN_TICKET: "t-1", ENGENTY_SOCKET: socket }
    );

    expect(seen).toMatchObject({
      argv: [
        "tools",
        "call",
        "invoices_create",
        "--input",
        '{"status":"draft"}',
      ],
      ticket: "t-1",
    });
    expect(result.code).toBe(2);
    expect(result.stdout.length).toBe(big.length);
    expect(result.stderr).toBe("needs approval\n");
  });

  it("without a session it says so and fails", async () => {
    const result = await runClient(["tools", "list"], {});
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("no Engenty session");
  });
});
