import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { createLogger } from "@engenty/telemetry";

import { destroyEngentySandboxById } from "./destroy-engenty-sandbox.js";
import { parseEngentySandboxId } from "./parse-engenty-sandbox-id.js";
import { stopSpaceComputerContainer } from "./space-computer.js";

const execFileAsync = promisify(execFile);
const logger = createLogger({ name: "apps/ai/sandbox-docker" });

export interface EngentyDockerSandboxRow {
  container_id: string;
  container_name: string;
  /** Container creation time, or null when Docker's stamp was unparseable. */
  created_at_ms: number | null;
  sandbox_id: string;
  state: string;
}

interface DockerPsJsonRow {
  CreatedAt?: string;
  ID?: string;
  Labels?: string;
  Names?: string;
  State?: string;
}

// Docker prints `2026-08-28 10:12:33 +0200 CEST` — a numeric offset followed by
// a zone ABBREVIATION, which `Date.parse` rejects outright. Rebuild the stamp
// from the parts that are unambiguous. A stamp without an offset is dropped
// rather than guessed: reading it as UTC would be hours wrong either way, and
// the only consumer (the age sweep) destroys containers.
export function parseDockerCreatedAtMs(raw: string | undefined): number | null {
  const match =
    /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})\s*([+-]\d{2}):?(\d{2})/.exec(
      raw?.trim() ?? ""
    );
  if (!match) {
    return null;
  }
  const parsed = Date.parse(`${match[1]}T${match[2]}${match[3]}:${match[4]}`);
  return Number.isFinite(parsed) ? parsed : null;
}

function readSandboxIdFromLabels(labels: string | undefined): string | null {
  if (!labels?.trim()) {
    return null;
  }
  for (const part of labels.split(",")) {
    const [key, value] = part.split("=");
    if (key?.trim() === "mastra.sandbox.id" && value?.trim()) {
      return value.trim();
    }
  }
  return null;
}

function normalizeContainerName(name: string | undefined): string {
  const trimmed = name?.trim() ?? "";
  return trimmed.startsWith("/") ? trimmed.slice(1) : trimmed;
}

export function parseDockerPsJsonLines(
  stdout: string
): EngentyDockerSandboxRow[] {
  const rows: EngentyDockerSandboxRow[] = [];
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    let parsed: DockerPsJsonRow;
    try {
      parsed = JSON.parse(trimmed) as DockerPsJsonRow;
    } catch {
      continue;
    }
    const sandboxId = readSandboxIdFromLabels(parsed.Labels);
    if (!sandboxId?.startsWith("engenty-")) {
      continue;
    }
    const containerId = parsed.ID?.trim();
    if (!containerId) {
      continue;
    }
    rows.push({
      container_id: containerId,
      container_name: normalizeContainerName(parsed.Names),
      created_at_ms: parseDockerCreatedAtMs(parsed.CreatedAt),
      sandbox_id: sandboxId,
      state: parsed.State?.trim() || "unknown",
    });
  }
  return rows;
}

export async function listEngentyDockerSandboxes(input?: {
  runningOnly?: boolean;
}): Promise<EngentyDockerSandboxRow[]> {
  const runningOnly = input?.runningOnly ?? true;
  try {
    const { stdout } = await execFileAsync(
      "docker",
      [
        "ps",
        ...(runningOnly ? [] : ["-a"]),
        "--filter",
        "label=mastra.sandbox=true",
        "--format",
        "{{json .}}",
      ],
      { maxBuffer: 8 * 1024 * 1024 }
    );
    return parseDockerPsJsonLines(stdout);
  } catch (err) {
    logger.warn("docker ps failed while listing engenty sandboxes", {
      message: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

/**
 * Every host path currently bind-mounted into a running engenty sandbox.
 *
 * The reaper deletes host dirs, so it needs the authoritative answer to "is
 * anything using this right now?". Container ids alone cannot give it: the
 * package caches are shared across runs and carry no scope key.
 *
 * Returns an empty set when docker is unreachable — the callers treat that as
 * "cannot prove it is free" and skip deleting.
 */
export async function listEngentyDockerSandboxBinds(): Promise<Set<string>> {
  const rows = await listEngentyDockerSandboxes({ runningOnly: true });
  const binds = new Set<string>();
  if (rows.length === 0) {
    return binds;
  }
  try {
    const { stdout } = await execFileAsync(
      "docker",
      [
        "inspect",
        "--format",
        "{{json .HostConfig.Binds}}",
        ...rows.map((row) => row.container_id),
      ],
      { maxBuffer: 8 * 1024 * 1024 }
    );
    for (const line of stdout.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === "null") {
        continue;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        continue;
      }
      if (!Array.isArray(parsed)) {
        continue;
      }
      for (const entry of parsed) {
        // `<hostPath>:<containerPath>[:opts]` — the host path is the first
        // segment, and absolute, so a plain split on ":" is unambiguous.
        const hostPath = String(entry).split(":")[0];
        if (hostPath.startsWith("/")) {
          binds.add(hostPath);
        }
      }
    }
  } catch (err) {
    logger.warn("docker inspect failed while listing sandbox binds", {
      message: err instanceof Error ? err.message : String(err),
    });
    return new Set<string>();
  }
  return binds;
}

export async function destroyAllEngentyDockerSandboxes(): Promise<number> {
  const rows = await listEngentyDockerSandboxes({ runningOnly: false });
  let destroyed = 0;
  for (const row of rows) {
    const parsed = parseEngentySandboxId(row.sandbox_id);
    if (!parsed) {
      continue;
    }
    try {
      // Space services survive deploys: STOP them (their writable layer and
      // profile are their state), never remove them. Everything else is
      // per-run and orphaned once this process is gone.
      if (parsed.lifecycle === "space" || parsed.lifecycle === "browser") {
        if (row.state === "running") {
          await stopSpaceComputerContainer(row.container_id);
        }
        continue;
      }
      await destroyEngentySandboxById(row.sandbox_id);
      destroyed += 1;
    } catch (err) {
      logger.warn("failed to destroy engenty sandbox on shutdown sweep", {
        message: err instanceof Error ? err.message : String(err),
        sandboxId: row.sandbox_id,
      });
    }
  }
  return destroyed;
}
