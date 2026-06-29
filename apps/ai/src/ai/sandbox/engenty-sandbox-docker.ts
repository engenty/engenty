import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { createLogger } from "@engenty/telemetry";

import { destroyEngentySandboxById } from "./destroy-engenty-sandbox.js";
import { parseEngentySandboxId } from "./parse-engenty-sandbox-id.js";

const execFileAsync = promisify(execFile);
const logger = createLogger({ name: "apps/ai/sandbox-docker" });

export interface EngentyDockerSandboxRow {
  container_id: string;
  container_name: string;
  sandbox_id: string;
  state: string;
}

interface DockerPsJsonRow {
  ID?: string;
  Labels?: string;
  Names?: string;
  State?: string;
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

export async function destroyAllEngentyDockerSandboxes(): Promise<number> {
  const rows = await listEngentyDockerSandboxes({ runningOnly: false });
  let destroyed = 0;
  for (const row of rows) {
    if (!parseEngentySandboxId(row.sandbox_id)) {
      continue;
    }
    try {
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
