// Which tab in a Space's browser is which agent's window, kept beside the
// Space's browser profile on the host. The browser outlives apps/ai (a
// restart, a deploy), so a new process has to find each window's tab again
// instead of opening another one. A CDP target id is only good while its
// container runs; a stale one is simply not found.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  resolveUserBrowserProfilePath,
  type UserBrowserIdentity,
} from "../sandbox/space-browser.js";

/** `browser/windows.json` in the Space's drive, beside `browser/profile`. */
function windowTabsPath(identity: UserBrowserIdentity): string {
  return path.join(
    path.dirname(resolveUserBrowserProfilePath(identity)),
    "windows.json"
  );
}

async function readAll(
  identity: UserBrowserIdentity
): Promise<Record<string, string>> {
  try {
    const parsed: unknown = JSON.parse(
      await readFile(windowTabsPath(identity), "utf8")
    );
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, string>)
      : {};
  } catch {
    return {};
  }
}

/** The CDP target of an agent's tab, as last recorded; null if none. */
export async function readWindowTab(
  identity: UserBrowserIdentity,
  agentId: string
): Promise<string | null> {
  const targetId = (await readAll(identity))[agentId];
  return typeof targetId === "string" ? targetId : null;
}

/** Record an agent's tab. Best effort: a lost write costs one extra tab. */
export async function writeWindowTab(
  identity: UserBrowserIdentity,
  agentId: string,
  targetId: string
): Promise<void> {
  try {
    const file = windowTabsPath(identity);
    const all = await readAll(identity);
    all[agentId] = targetId;
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(all));
  } catch {
    // Nothing to do: the next process opens a fresh tab.
  }
}
