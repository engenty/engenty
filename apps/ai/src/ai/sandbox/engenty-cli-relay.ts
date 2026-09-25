// `engenty` in a sandbox shell (the architecture review's B): the host half.
//
// The container half is `deploy/sandbox/engenty.mjs`. Its relay listens on a
// unix socket INSIDE the container and talks to apps/ai over the stdio of the
// `docker exec` that started it — a socket bound in from the host does not
// work on Docker Desktop (connect fails with ENOTSUP), and the container may
// have no network at all. One relay per container, started on the first
// command and gone with the container.
//
// Each command a run executes gets a TICKET in its env, minted when the
// command starts and dropped when it returns. A request is answered in the
// async context of the run that minted it (`AsyncResource.bind`), so the CLI
// acts with exactly that run's token, Space gate and grants — no credential
// enters the container. A background process outlives its ticket, so it gets
// none.

import { AsyncResource } from "node:async_hooks";
import { type ChildProcess, execFile, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { promisify } from "node:util";

import { createLogger } from "@engenty/telemetry";
import type { MastraSandbox } from "@mastra/core/workspace";

import {
  type EngentyCliResult,
  runEngentyCli,
} from "../../../ai/tools/engenty-tools/engenty-cli.js";
import { getEngentyToolsRunContext } from "../../../ai/tools/engenty-tools/lib/run-context.js";

const execFileAsync = promisify(execFile);
const logger = createLogger({ name: "apps/ai/engenty-cli-relay" });

const RELAY_READY_TIMEOUT_MS = 10_000;

interface Relay {
  child: ChildProcess;
  socket: string;
}

interface Ticket {
  run: (argv: readonly string[]) => Promise<EngentyCliResult>;
  sandboxId: string;
}

const relays = new Map<string, Promise<Relay>>();
const tickets = new Map<string, Ticket>();

async function runningContainerId(sandboxId: string): Promise<string | null> {
  const { stdout } = await execFileAsync("docker", [
    "ps",
    "-q",
    "--filter",
    `label=mastra.sandbox.id=${sandboxId}`,
  ]);
  return stdout.trim().split("\n")[0] || null;
}

/** What a request with this ticket, from this container's relay, gets. */
export async function answerRelayRequest(
  sandboxId: string,
  request: unknown
): Promise<EngentyCliResult> {
  const { argv, ticket } = (request ?? {}) as {
    argv?: unknown;
    ticket?: unknown;
  };
  const entry = typeof ticket === "string" ? tickets.get(ticket) : undefined;
  // A ticket is good only in the container its command runs in.
  if (!entry || entry.sandboxId !== sandboxId) {
    return {
      exitCode: 1,
      stderr:
        "engenty: this command's Engenty session has ended. Run engenty directly in a command of your own.\n",
      stdout: "",
    };
  }
  const args = Array.isArray(argv)
    ? argv.filter((a): a is string => typeof a === "string")
    : [];
  return entry.run(args);
}

function startRelay(sandboxId: string): Promise<Relay> {
  return new Promise<Relay>((resolve, reject) => {
    void (async () => {
      const containerId = await runningContainerId(sandboxId);
      if (!containerId) {
        reject(new Error("sandbox container not running"));
        return;
      }
      // Root, so the socket's dir is one the sandbox user cannot replace.
      const child = spawn(
        "docker",
        [
          "exec",
          "-i",
          "-u",
          "0",
          containerId,
          "node",
          "/usr/local/bin/engenty",
          "relay",
        ],
        { stdio: ["pipe", "pipe", "pipe"] }
      );
      let ready = false;
      let buffer = "";
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error("engenty relay did not start"));
      }, RELAY_READY_TIMEOUT_MS);
      timer.unref();
      const reply = (id: unknown, result: EngentyCliResult) => {
        child.stdin?.write(`${JSON.stringify({ id, ...result })}\n`);
      };
      child.stdout?.setEncoding("utf8");
      child.stdout?.on("data", (chunk: string) => {
        buffer += chunk;
        let cut = buffer.indexOf("\n");
        while (cut >= 0) {
          const line = buffer.slice(0, cut);
          buffer = buffer.slice(cut + 1);
          cut = buffer.indexOf("\n");
          let frame: {
            id?: unknown;
            request?: unknown;
            socket?: unknown;
            type?: unknown;
          };
          try {
            frame = JSON.parse(line);
          } catch {
            continue;
          }
          if (frame.type === "ready" && typeof frame.socket === "string") {
            ready = true;
            clearTimeout(timer);
            resolve({ child, socket: frame.socket });
          } else if (frame.type === "request") {
            answerRelayRequest(sandboxId, frame.request).then(
              (result) => reply(frame.id, result),
              (err: unknown) =>
                reply(frame.id, {
                  exitCode: 1,
                  stderr: `engenty: ${err instanceof Error ? err.message : String(err)}\n`,
                  stdout: "",
                })
            );
          }
        }
      });
      child.on("exit", () => {
        relays.delete(sandboxId);
        if (!ready) {
          clearTimeout(timer);
          reject(new Error("engenty relay exited before it was ready"));
        }
      });
      child.on("error", (err) => {
        relays.delete(sandboxId);
        reject(err);
      });
    })().catch(reject);
  });
}

function relayFor(sandboxId: string): Promise<Relay> {
  let relay = relays.get(sandboxId);
  if (!relay) {
    relay = startRelay(sandboxId);
    relay.catch(() => relays.delete(sandboxId));
    relays.set(sandboxId, relay);
  }
  return relay;
}

/**
 * The env that lets `engenty` in this command act as the calling run, and
 * the close that ends it. Null — the command runs without — when the run has
 * no token to act with or the relay cannot start (an image without the CLI).
 */
async function openCliSession(sandbox: MastraSandbox) {
  if (!getEngentyToolsRunContext().accessToken?.trim()) {
    return null;
  }
  try {
    const lifecycle = sandbox as unknown as {
      start?: () => Promise<unknown>;
      status?: string;
    };
    if (lifecycle.status !== "running" && lifecycle.start) {
      await lifecycle.start();
    }
    const relay = await relayFor(sandbox.id);
    const ticket = randomBytes(24).toString("hex");
    tickets.set(ticket, {
      run: AsyncResource.bind((argv: readonly string[]) => runEngentyCli(argv)),
      sandboxId: sandbox.id,
    });
    return {
      close: () => tickets.delete(ticket),
      env: { ENGENTY_RUN_TICKET: ticket, ENGENTY_SOCKET: relay.socket },
    };
  } catch (err) {
    logger.warn("engenty CLI unavailable for this command", {
      message: err instanceof Error ? err.message : String(err),
      sandboxId: sandbox.id,
    });
    return null;
  }
}

/**
 * Give every command on this sandbox an `engenty` session. Patched onto
 * `executeCommand` like the space computer's serialization — the one method
 * both the workspace tool and the approved-command path call.
 */
export function withEngentyCli<T extends MastraSandbox>(sandbox: T): T {
  const executeCommand = sandbox.executeCommand;
  if (!executeCommand) {
    return sandbox;
  }
  const bound = executeCommand.bind(sandbox);
  sandbox.executeCommand = (async (
    ...[command, args, options]: Parameters<typeof bound>
  ) => {
    const session = await openCliSession(sandbox);
    try {
      return await bound(
        command,
        args,
        session
          ? { ...options, env: { ...options?.env, ...session.env } }
          : options
      );
    } finally {
      session?.close();
    }
  }) as typeof executeCommand;
  return sandbox;
}

/** Tests only. */
export function issueTicketForTests(ticket: string, entry: Ticket): () => void {
  tickets.set(ticket, entry);
  return () => tickets.delete(ticket);
}
