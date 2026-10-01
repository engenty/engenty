// Host half of `git_remote`: the git network calls that need a person's token,
// made where the agent cannot read the token.
//
// The token never enters the sandbox. The host keeps one bare mirror per
// remote (per Space, outside every bind) and is the only side that talks to
// the remote. Code moves between the mirror and the agent's repository as a
// git bundle, piped through `docker exec` — so the host neither runs git
// inside the agent's repository (its config and hooks are the agent's) nor
// writes into the agent's folders (a path there can be a symlink the agent
// planted). Inside the container, the bundle is plain data for the agent's own
// git.
//
// Every host git call runs with no system or global config, no prompts, a
// credential helper that only answers from this process's environment, and a
// protocol allowlist.

import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
} from "node:fs";
import { devNull, tmpdir } from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";

import { resolveEngentyHostRoot } from "../workspace/local-workspace-paths.js";

const GIT_TIMEOUT_MS = 10 * 60 * 1000;
const OUTPUT_LIMIT = 16 * 1024;
/** A bundle pulled out of the sandbox for a push; larger is refused. */
export const PUSH_BUNDLE_LIMIT_BYTES = 512 * 1024 * 1024;

// Answers `get` only, from this process's env — never from a file the agent
// could read, and never `store`.
const CREDENTIAL_HELPER =
  '!f() { test "$1" = get || exit 0; printf "username=%s\\npassword=%s\\n" "$ENGENTY_GIT_USERNAME" "$ENGENTY_GIT_PASSWORD"; }; f';

const AUTH_FAILURE_RE =
  /Authentication failed|could not read (Username|Password)|terminal prompts disabled|Invalid username or password|HTTP Basic: Access denied|Repository not found|returned error: 40[13]/i;

export interface GitRemote {
  /** `github.com`, or `host:port`. */
  host: string;
  url: string;
}

export interface GitCredential {
  password: string;
  username: string;
}

export interface GitResult {
  code: number;
  /** stdout + stderr, with the password scrubbed, cut to OUTPUT_LIMIT. */
  output: string;
}

/** An https remote without credentials, query or fragment; else null. */
export function parseGitRemote(raw: string): GitRemote | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (
    url.protocol !== "https:" ||
    !url.hostname ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname.length <= 1
  ) {
    return null;
  }
  return {
    host: url.port
      ? `${url.hostname.toLowerCase()}:${url.port}`
      : url.hostname.toLowerCase(),
    url: url.toString(),
  };
}

export function isGitAuthFailure(result: GitResult): boolean {
  return result.code !== 0 && AUTH_FAILURE_RE.test(result.output);
}

function scrub(text: string, credential?: GitCredential): string {
  let out = text;
  if (credential && credential.password.length >= 4) {
    out = out.split(credential.password).join("***");
  }
  return out.length > OUTPUT_LIMIT ? `${out.slice(-OUTPUT_LIMIT)}` : out;
}

let hostGitHome: string | null = null;
function emptyHome(): string {
  hostGitHome ??= mkdtempSync(path.join(tmpdir(), "engenty-git-home-"));
  return hostGitHome;
}

function hostGitEnv(
  allowProtocol: "file" | "https",
  credential?: GitCredential
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    GIT_ALLOW_PROTOCOL: allowProtocol,
    GIT_CONFIG_COUNT: "2",
    GIT_CONFIG_GLOBAL: devNull,
    // The first entry empties the helper list; the second is the only helper.
    GIT_CONFIG_KEY_0: "credential.helper",
    GIT_CONFIG_KEY_1: "credential.helper",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_VALUE_0: "",
    GIT_CONFIG_VALUE_1: credential ? CREDENTIAL_HELPER : "",
    GIT_TERMINAL_PROMPT: "0",
    HOME: emptyHome(),
    LANG: "C",
    PATH: process.env.PATH,
  };
  for (const name of [
    "HTTPS_PROXY",
    "HTTP_PROXY",
    "NO_PROXY",
    "https_proxy",
    "http_proxy",
    "no_proxy",
    "SSL_CERT_FILE",
  ]) {
    if (process.env[name]) {
      env[name] = process.env[name];
    }
  }
  if (credential) {
    env.ENGENTY_GIT_USERNAME = credential.username;
    env.ENGENTY_GIT_PASSWORD = credential.password;
  }
  return env;
}

export function runHostGit(
  args: readonly string[],
  options: {
    allowProtocol: "file" | "https";
    credential?: GitCredential;
  }
): Promise<GitResult> {
  return new Promise((resolve) => {
    const child = spawn("git", [...args], {
      env: hostGitEnv(options.allowProtocol, options.credential),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    const collect = (chunk: Buffer) => {
      output += chunk.toString("utf8");
      if (output.length > OUTPUT_LIMIT * 2) {
        output = output.slice(-OUTPUT_LIMIT * 2);
      }
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    const timer = setTimeout(() => child.kill("SIGKILL"), GIT_TIMEOUT_MS);
    timer.unref();
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ code: 1, output: scrub(error.message, options.credential) });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, output: scrub(output, options.credential) });
    });
  });
}

/** Where the host keeps a remote's bare mirror: per Space, never bound in. */
export function gitMirrorDir(input: {
  remote: GitRemote;
  spaceId: string;
  tenantId: string;
}): string {
  const id = createHash("sha256")
    .update(input.remote.url)
    .digest("hex")
    .slice(0, 32);
  return path.join(
    resolveEngentyHostRoot(),
    "git-mirrors",
    input.tenantId,
    input.spaceId,
    `${id}.git`
  );
}

// Two runs on one remote share its mirror; one git call on it at a time.
const mirrorLocks = new Map<string, Promise<unknown>>();

export function withMirrorLock<T>(dir: string, work: () => Promise<T>) {
  const previous = mirrorLocks.get(dir) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(work);
  mirrorLocks.set(dir, next);
  return next.finally(() => {
    if (mirrorLocks.get(dir) === next) {
      mirrorLocks.delete(dir);
    }
  });
}

/** Clone the mirror on first use, fetch it after. Call under the lock. */
export async function syncGitMirror(
  dir: string,
  remote: GitRemote,
  credential?: GitCredential
): Promise<GitResult> {
  if (existsSync(path.join(dir, "HEAD"))) {
    return runHostGit(["-C", dir, "fetch", "--prune", "--quiet", "origin"], {
      allowProtocol: "https",
      ...(credential ? { credential } : {}),
    });
  }
  mkdirSync(path.dirname(dir), { recursive: true });
  const staging = `${dir}.tmp-${randomUUID()}`;
  const result = await runHostGit(
    ["clone", "--mirror", "--quiet", remote.url, staging],
    { allowProtocol: "https", ...(credential ? { credential } : {}) }
  );
  if (result.code === 0) {
    renameSync(staging, dir);
  } else {
    rmSync(staging, { force: true, recursive: true });
  }
  return result;
}

/** A host-owned scratch dir for one call's bundle; removed by the caller. */
export function hostScratchDir(): string {
  return mkdtempSync(path.join(tmpdir(), "engenty-git-"));
}

function waitForExit(
  child: ReturnType<typeof spawn>,
  what: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`${what} exited ${code}`))
    );
  });
}

/**
 * Write a host file into the container at `containerPath`. The write happens
 * inside the container as its own user, so the path resolves in the agent's
 * view of the filesystem and never reaches the host.
 */
export async function pipeIntoContainer(input: {
  containerId: string;
  containerPath: string;
  hostFile: string;
}): Promise<void> {
  const child = spawn(
    "docker",
    [
      "exec",
      "-i",
      input.containerId,
      "sh",
      "-c",
      'set -e; mkdir -p "$(dirname "$1")"; cat > "$1"',
      "sh",
      input.containerPath,
    ],
    { stdio: ["pipe", "ignore", "ignore"] }
  );
  const exited = waitForExit(child, "docker exec (write)");
  await pipeline(createReadStream(input.hostFile), child.stdin as never);
  await exited;
}

/** Read a file out of the container into a host file, up to `maxBytes`. */
export async function pipeOutOfContainer(input: {
  containerId: string;
  containerPath: string;
  hostFile: string;
  maxBytes: number;
}): Promise<void> {
  const child = spawn(
    "docker",
    ["exec", input.containerId, "cat", "--", input.containerPath],
    { stdio: ["ignore", "pipe", "ignore"] }
  );
  const exited = waitForExit(child, "docker exec (read)");
  let bytes = 0;
  child.stdout?.on("data", (chunk: Buffer) => {
    bytes += chunk.length;
    if (bytes > input.maxBytes) {
      child.kill("SIGKILL");
    }
  });
  try {
    await pipeline(child.stdout as never, createWriteStream(input.hostFile));
    await exited;
  } catch (error) {
    throw bytes > input.maxBytes ? new Error("bundle_too_large") : error;
  }
}
