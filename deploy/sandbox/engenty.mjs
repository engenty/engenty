#!/usr/bin/env node
// `engenty` inside an agent sandbox: module operations from bash.
//
// Two roles in one file, no dependencies:
//   engenty <args…>   the client. Sends its argv to the relay over the unix
//                     socket in $ENGENTY_SOCKET, with $ENGENTY_RUN_TICKET, and
//                     prints what apps/ai answers. Every command an agent runs
//                     through its tools carries both; nothing else does.
//   engenty relay     started by apps/ai as root (`docker exec -i -u 0`), one
//                     per container. Listens on a socket in a fresh root-owned
//                     dir and passes each request to apps/ai over its own
//                     stdin/stdout — so it works with network `none`, and no
//                     bearer token ever enters the container. apps/ai maps the
//                     ticket to the run that started the command.

import { chmodSync, mkdtempSync, readFileSync } from "node:fs";
import { chmod } from "node:fs/promises";
import net from "node:net";
import path from "node:path";

const argv = process.argv.slice(2);

if (argv[0] === "relay") {
  relay();
} else {
  client(argv);
}

function relay() {
  // A fresh name, so a process that was here first cannot hold the path; the
  // dir is root's, so no one else can swap the socket inside it.
  const dir = mkdtempSync("/tmp/engenty-");
  chmodSync(dir, 0o755);
  const socketPath = path.join(dir, "engenty.sock");
  const waiting = new Map();
  let nextId = 1;
  let buffer = "";

  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    buffer += chunk;
    let cut = buffer.indexOf("\n");
    while (cut >= 0) {
      const line = buffer.slice(0, cut);
      buffer = buffer.slice(cut + 1);
      cut = buffer.indexOf("\n");
      let reply;
      try {
        reply = JSON.parse(line);
      } catch {
        continue;
      }
      const socket = waiting.get(reply.id);
      waiting.delete(reply.id);
      socket?.end(`${JSON.stringify(reply)}\n`);
    }
  });
  // apps/ai went away: nothing can answer any more.
  process.stdin.on("end", () => process.exit(0));

  const server = net.createServer((socket) => {
    let request = "";
    let sent = false;
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => {
      request += chunk;
      if (sent || !request.includes("\n")) {
        return;
      }
      sent = true;
      const id = nextId++;
      waiting.set(id, socket);
      let parsed;
      try {
        parsed = JSON.parse(request.slice(0, request.indexOf("\n")));
      } catch {
        waiting.delete(id);
        socket.end(
          `${JSON.stringify({ exitCode: 1, stderr: "engenty: bad request\n", stdout: "" })}\n`
        );
        return;
      }
      process.stdout.write(
        `${JSON.stringify({ id, request: parsed, type: "request" })}\n`
      );
    });
    socket.on("close", () => {
      for (const [id, s] of waiting) {
        if (s === socket) {
          waiting.delete(id);
        }
      }
    });
    socket.on("error", () => undefined);
  });
  server.listen(socketPath, async () => {
    // The dir is root's; the socket is for every process in the container.
    await chmod(socketPath, 0o666);
    process.stdout.write(
      `${JSON.stringify({ socket: socketPath, type: "ready" })}\n`
    );
  });
}

/** `--input @file.json` and `--input -` are read here, where the file is. */
function resolveInput(args) {
  const out = [...args];
  const at = out.indexOf("--input");
  const value = at >= 0 ? out[at + 1] : undefined;
  if (value === "-") {
    out[at + 1] = readFileSync(0, "utf8");
  } else if (value?.startsWith("@")) {
    out[at + 1] = readFileSync(value.slice(1), "utf8");
  }
  return out;
}

function client(args) {
  const socketPath = process.env.ENGENTY_SOCKET;
  const ticket = process.env.ENGENTY_RUN_TICKET;
  if (!(socketPath && ticket)) {
    process.stderr.write(
      "engenty: no Engenty session here. It works in commands you run with your execute_command tool, not in background processes or shells they start later.\n"
    );
    process.exit(1);
  }
  let resolved;
  try {
    resolved = resolveInput(args);
  } catch (err) {
    process.stderr.write(`engenty: ${err.message}\n`);
    process.exit(1);
  }
  const socket = net.connect(socketPath);
  let answer = "";
  socket.setEncoding("utf8");
  socket.on("connect", () => {
    socket.write(
      `${JSON.stringify({ argv: resolved, cwd: process.cwd(), ticket })}\n`
    );
  });
  socket.on("data", (chunk) => {
    answer += chunk;
  });
  socket.on("error", (err) => {
    process.stderr.write(`engenty: cannot reach Engenty (${err.message})\n`);
    process.exit(1);
  });
  socket.on("end", () => {
    let reply;
    try {
      reply = JSON.parse(answer);
    } catch {
      process.stderr.write("engenty: no answer from Engenty\n");
      process.exit(1);
    }
    // exitCode, not exit(): a piped stdout must drain first.
    process.exitCode = typeof reply.exitCode === "number" ? reply.exitCode : 1;
    process.stdout.write(reply.stdout ?? "");
    process.stderr.write(reply.stderr ?? "");
  });
}
