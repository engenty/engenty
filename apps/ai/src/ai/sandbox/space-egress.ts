// A Space computer's own egress hosts, handed to the egress proxy
// (`deploy/egress-proxy/proxy.mjs`).
//
// The proxy has one shared allowlist (the package registries) and no idea
// which container is asking. So each Space computer carries its Space in its
// proxy URL — `http://<spaceId>:<key>@proxy` — and apps/ai writes what the
// proxy checks it against: `<spaces root>/egress/<spaceId>.json` holding the
// key's hash and the Space's hosts, rewritten on every run so a settings
// change applies without restarting anything.
//
// The key lives in the Space's folder, beside the folders the container binds
// and never inside one of them, and stays the same for the Space's life: the
// container's env is fixed when it is created.

import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { resolveSpaceDir } from "@engenty/environment/env";

import { resolveEngentyHostRoot } from "../workspace/local-workspace-paths.js";

const KEY_FILE = "egress.key";

/** Where the proxy reads the Space lists; mounted read-only into it. */
export function resolveEgressSpacesDir(): string {
  return path.join(resolveEngentyHostRoot(), "egress");
}

function readOrCreateKey(tenantId: string, spaceId: string): string {
  const dir = resolveSpaceDir(tenantId, spaceId);
  const file = path.join(dir, KEY_FILE);
  try {
    const existing = readFileSync(file, "utf8").trim();
    if (existing) {
      return existing;
    }
  } catch {
    // First run of this Space's computer.
  }
  mkdirSync(dir, { recursive: true });
  const key = randomBytes(24).toString("hex");
  writeFileSync(file, `${key}\n`, { mode: 0o600 });
  return key;
}

/**
 * Publish the Space's hosts to the proxy and return the credentials its
 * computer names itself with.
 */
export function publishSpaceEgress(input: {
  hosts: readonly string[];
  spaceId: string;
  tenantId: string;
}): { password: string; username: string } {
  const key = readOrCreateKey(input.tenantId, input.spaceId);
  const dir = resolveEgressSpacesDir();
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${input.spaceId}.json`);
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(
    tmp,
    JSON.stringify({
      hosts: [...input.hosts],
      key_sha256: createHash("sha256").update(key).digest("hex"),
    })
  );
  // Readable by the proxy's own user; the file holds a hash, not the key.
  chmodSync(tmp, 0o644);
  renameSync(tmp, file);
  return { password: key, username: input.spaceId };
}

/** A purged Space's list goes with its folder. */
export function removeSpaceEgress(spaceId: string): void {
  rmSync(path.join(resolveEgressSpacesDir(), `${spaceId}.json`), {
    force: true,
  });
}
