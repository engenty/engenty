import { CHAT_ATTACHMENT_MAX_BYTES } from "./upload-chat-attachment.js";

/**
 * What the composer does with a file before it becomes an attachment.
 *
 * `blocked` never attaches: a program or installer (by extension or by its
 * bytes), an empty file, a file over the upload limit. `ask` attaches only
 * after the person confirms: files the agent cannot read inside (archives),
 * Office files that carry macros, and files whose bytes say they are
 * something other than their name. Everything else attaches as before —
 * non-model files still land in the Vault.
 *
 * This is a courtesy check in the browser, not a security boundary: it keeps
 * people from attaching the wrong file, it does not stop a determined one.
 */
export type ChatAttachmentScreen =
  | { kind: "ok" }
  | { kind: "blocked"; reason: "empty" | "executable" | "too_large" }
  | { kind: "ask"; reason: "archive" | "macro" | "mismatch" };

const EXECUTABLE_EXTENSIONS = new Set([
  "apk",
  "app",
  "appx",
  "bat",
  "cmd",
  "com",
  "cpl",
  "deb",
  "dll",
  "dmg",
  "exe",
  "hta",
  "iso",
  "jar",
  "lnk",
  "msi",
  "msix",
  "pkg",
  "ps1",
  "reg",
  "rpm",
  "scr",
  "vbe",
  "vbs",
  "wsf",
]);

const MACRO_EXTENSIONS = new Set([
  "docm",
  "dotm",
  "potm",
  "pptm",
  "xlam",
  "xlsb",
  "xlsm",
  "xltm",
]);

const ARCHIVE_EXTENSIONS = new Set(["7z", "gz", "rar", "tar", "tgz", "zip"]);

type Signature =
  | "elf"
  | "gif"
  | "jpeg"
  | "macho"
  | "pdf"
  | "png"
  | "pe"
  | "zip";

/** What the file's name promises its bytes are. Absent: no promise to check. */
const EXPECTED_SIGNATURES: Record<string, readonly Signature[] | "text"> = {
  csv: "text",
  docx: ["zip"],
  gif: ["gif"],
  jpeg: ["jpeg"],
  jpg: ["jpeg"],
  json: "text",
  md: "text",
  odp: ["zip"],
  ods: ["zip"],
  odt: ["zip"],
  pdf: ["pdf"],
  png: ["png"],
  pptx: ["zip"],
  tsv: "text",
  txt: "text",
  xlsx: ["zip"],
  zip: ["zip"],
};

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

function startsWith(bytes: Uint8Array, prefix: readonly number[]): boolean {
  return prefix.every((value, index) => bytes[index] === value);
}

function signatureOf(bytes: Uint8Array): Signature | null {
  if (startsWith(bytes, [0x4d, 0x5a])) {
    return "pe";
  }
  if (startsWith(bytes, [0x7f, 0x45, 0x4c, 0x46])) {
    return "elf";
  }
  if (
    startsWith(bytes, [0xfe, 0xed, 0xfa, 0xce]) ||
    startsWith(bytes, [0xfe, 0xed, 0xfa, 0xcf]) ||
    startsWith(bytes, [0xce, 0xfa, 0xed, 0xfe]) ||
    startsWith(bytes, [0xcf, 0xfa, 0xed, 0xfe]) ||
    startsWith(bytes, [0xca, 0xfe, 0xba, 0xbe])
  ) {
    return "macho";
  }
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) {
    return "zip";
  }
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) {
    return "pdf";
  }
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) {
    return "png";
  }
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return "jpeg";
  }
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) {
    return "gif";
  }
  return null;
}

const EXECUTABLE_SIGNATURES = new Set<Signature>(["elf", "macho", "pe"]);

const EXECUTABLE_MEDIA_TYPES = new Set([
  "application/java-archive",
  "application/vnd.android.package-archive",
  "application/vnd.microsoft.portable-executable",
  "application/x-apple-diskimage",
  "application/x-executable",
  "application/x-ms-installer",
  "application/x-msdos-program",
  "application/x-msdownload",
  "application/x-msi",
]);

/**
 * During a drag only media types are readable (names arrive with the drop).
 * True when one of them is a program — enough to warn before the drop; the
 * drop itself is screened in full by {@link screenChatAttachment}.
 */
export function dragCarriesExecutable(types: readonly string[]): boolean {
  return types.some((type) => EXECUTABLE_MEDIA_TYPES.has(type));
}

export async function screenChatAttachment(
  file: File
): Promise<ChatAttachmentScreen> {
  if (file.size === 0) {
    return { kind: "blocked", reason: "empty" };
  }
  if (file.size > CHAT_ATTACHMENT_MAX_BYTES) {
    return { kind: "blocked", reason: "too_large" };
  }
  const ext = extensionOf(file.name);
  if (EXECUTABLE_EXTENSIONS.has(ext)) {
    return { kind: "blocked", reason: "executable" };
  }
  const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const signature = signatureOf(head);
  if (signature && EXECUTABLE_SIGNATURES.has(signature)) {
    return { kind: "blocked", reason: "executable" };
  }
  if (MACRO_EXTENSIONS.has(ext)) {
    return { kind: "ask", reason: "macro" };
  }
  const expected = EXPECTED_SIGNATURES[ext];
  if (expected && signature) {
    const matches = expected !== "text" && expected.includes(signature);
    if (!matches) {
      return { kind: "ask", reason: "mismatch" };
    }
  }
  if (ARCHIVE_EXTENSIONS.has(ext)) {
    return { kind: "ask", reason: "archive" };
  }
  return { kind: "ok" };
}
