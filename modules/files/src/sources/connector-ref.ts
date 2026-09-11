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

/**
 * `parentRef` rides along because WRITES need it and a provider entry does not
 * carry it (PLAN-space-data-agent-crud P2.2).
 *
 * `ConnectorFileEntry` has `ref`, `name`, `kind` — and no parent. But the
 * storage capability addresses a write by `folder_ref` + `name` and a rename by
 * `to_folder_ref` + `new_name`, so an id that only knew the file could rename
 * nothing. The listing DOES know the parent at the moment it mints the id, so
 * the id is where that knowledge is kept.
 *
 * Appended rather than inserted, so every id minted before this still decodes —
 * it simply reports `parentRef: null`, which reads as "position unknown" and
 * makes the write paths refuse rather than guess.
 *
 * The connection (or mount) ROOT is not unknown: listing encodes it as `""`
 * so a file sitting at the granted folder can still be saved. `folder_ref: null`
 * is what the storage capability uses for that root.
 */
export function encodeConnectorNodeId(
  connectionId: string,
  ref: string,
  parentRef?: string | null
): string {
  const base = `${PREFIX}${connectionId}:${toBase64Url(ref)}`;
  return parentRef === undefined || parentRef === null
    ? base
    : `${base}:${toBase64Url(parentRef)}`;
}

export function decodeConnectorNodeId(id: string): {
  connectionId: string;
  parentRef: string | null;
  ref: string;
} | null {
  if (!isConnectorNodeId(id)) {
    return null;
  }
  const rest = id.slice(PREFIX.length);
  const sep = rest.indexOf(":");
  if (sep <= 0) {
    return null;
  }
  const connectionId = rest.slice(0, sep);
  const tail = rest.slice(sep + 1);
  const parentSep = tail.indexOf(":");
  try {
    return parentSep === -1
      ? { connectionId, parentRef: null, ref: fromBase64Url(tail) }
      : {
          connectionId,
          parentRef: fromBase64Url(tail.slice(parentSep + 1)),
          ref: fromBase64Url(tail.slice(0, parentSep)),
        };
  } catch {
    return null;
  }
}
