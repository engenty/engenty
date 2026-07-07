/**
 * Virtual node ids for connector-mounted folders. Only the mount root is a DB
 * row (a `file_folders` uuid); every node beneath it is virtual and identified
 * as `cnx:<connectionUuid>:<base64url(providerRef)>`. base64url because
 * provider refs (S3 keys, local paths) contain `/` and `:`.
 *
 * Uses web-standard atob/btoa (+TextEncoder for unicode) so the codec works in
 * both the server runtime and the browser without node typings.
 */

const PREFIX = "cnx:";

function toBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function isConnectorNodeId(id: string): boolean {
  return id.startsWith(PREFIX);
}

export function encodeConnectorNodeId(
  connectionId: string,
  ref: string
): string {
  return `${PREFIX}${connectionId}:${toBase64Url(ref)}`;
}

export function decodeConnectorNodeId(
  id: string
): { connectionId: string; ref: string } | null {
  if (!isConnectorNodeId(id)) {
    return null;
  }
  const rest = id.slice(PREFIX.length);
  const sep = rest.indexOf(":");
  if (sep <= 0) {
    return null;
  }
  const connectionId = rest.slice(0, sep);
  try {
    return { connectionId, ref: fromBase64Url(rest.slice(sep + 1)) };
  } catch {
    return null;
  }
}
