export function parseContentTypeHeader(header: string | null): {
  charset: string;
  mime: string;
} {
  if (!header?.trim()) {
    return { charset: "utf-8", mime: "application/octet-stream" };
  }
  const parts = header.split(";").map((p) => p.trim());
  const mime = (parts[0] ?? "application/octet-stream").toLowerCase();
  let charset = "utf-8";
  for (const p of parts.slice(1)) {
    const m = /^charset\s*=\s*(.+)$/i.exec(p);
    if (m?.[1]) {
      charset = m[1].replace(/^["']|["']$/g, "").trim() || charset;
    }
  }
  return { charset, mime };
}

export function bytesToText(buf: ArrayBuffer, charset: string): string {
  try {
    return new TextDecoder(charset, { fatal: false }).decode(buf);
  } catch {
    return new TextDecoder("utf-8", { fatal: false }).decode(buf);
  }
}

export async function readBodyWithCap(
  response: Response,
  maxBytes: number
): Promise<ArrayBuffer> {
  const reader = response.body?.getReader();
  if (!reader) {
    const all = await response.arrayBuffer();
    if (all.byteLength > maxBytes) {
      throw new Error(`Response larger than ${maxBytes} bytes`);
    }
    return all;
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (!value) {
      continue;
    }
    total += value.byteLength;
    if (total > maxBytes) {
      reader.cancel().catch(() => {});
      throw new Error(`Response larger than ${maxBytes} bytes`);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out.buffer;
}
