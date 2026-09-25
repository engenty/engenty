// MCP servers an installer registered on a space computer.
//
// Installers write their MCP server into the config of the coding agents they
// expect — `~/.claude.json`, `~/.cursor/mcp.json`, `~/.gemini/settings.json`.
// Nothing on the computer runs those. A remote one (an http/sse URL) can be
// imported as a connector instead, which is where its tools get a Space gate,
// approvals and audit. A stdio one is a process on the machine; it is listed
// so the bot can say why it is not offered.

import type { UntrustedTree } from "./space-computer-home.js";

/** Config files installers write MCP servers to, relative to `$HOME`. */
export const MCP_CONFIG_FILES = [
  ".claude.json",
  ".cursor/mcp.json",
  ".gemini/settings.json",
] as const;

const MAX_CONFIG_BYTES = 1024 * 1024;

export type SpaceComputerMcpServer =
  | { found_in: string; kind: "remote"; name: string; url: string }
  | { command: string; found_in: string; kind: "stdio"; name: string };

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function remoteUrl(entry: Record<string, unknown>): string | null {
  for (const key of ["url", "httpUrl", "serverUrl"]) {
    const value = entry[key];
    if (typeof value !== "string") {
      continue;
    }
    try {
      const url = new URL(value.trim());
      if (url.protocol === "https:" || url.protocol === "http:") {
        return url.toString();
      }
    } catch {
      // Not a URL; try the next key.
    }
  }
  return null;
}

/**
 * Every server in the known config files, first file winning on a name.
 * A file that is absent, outside $HOME, too large or not JSON contributes nothing.
 */
export async function listSpaceComputerMcpServers(
  home: UntrustedTree
): Promise<SpaceComputerMcpServer[]> {
  const servers: SpaceComputerMcpServer[] = [];
  const seen = new Set<string>();
  for (const file of MCP_CONFIG_FILES) {
    const bytes = await home.readFile(file, MAX_CONFIG_BYTES);
    if (!bytes) {
      continue;
    }
    let config: Record<string, unknown> | null;
    try {
      config = asRecord(JSON.parse(bytes.toString("utf8")));
    } catch {
      continue;
    }
    const entries = asRecord(config?.mcpServers) ?? {};
    for (const [name, raw] of Object.entries(entries)) {
      const entry = asRecord(raw);
      if (!entry || seen.has(name)) {
        continue;
      }
      const url = remoteUrl(entry);
      if (url) {
        seen.add(name);
        servers.push({ found_in: `~/${file}`, kind: "remote", name, url });
      } else if (typeof entry.command === "string") {
        seen.add(name);
        servers.push({
          command: entry.command,
          found_in: `~/${file}`,
          kind: "stdio",
          name,
        });
      }
    }
  }
  return servers;
}
