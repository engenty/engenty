/**
 * Does a shell command need a human before it runs in the sandbox?
 *
 * The container is disposable, so a command only matters where its effect
 * outlives it. Two places do: other people's files, and the outside world.
 *
 * - Shared files: a delete, move or overwrite that names a shared mount
 *   (`/space`, `/project`, `/data`, `/company`), or runs with one as its
 *   working directory. `/company` is read-only and `/data` flushes through
 *   the modules' own gated operations, so in practice this guards `/space`.
 *   Writing NEW files there is ordinary work and does not ask.
 * - The outside world: `git push`, an HTTP request that sends data or uses a
 *   non-read method, and remote copy tools. A plain GET does not ask.
 * - Opaque commands: `eval`, command substitution, decode-and-run pipes. The
 *   text cannot be read, so it is not treated as safe.
 *
 * A command that names a shared mount but is not plainly a read is not decided
 * here: it is `review`, and the Jev classifier gets the last word
 * ({@link jevSaysCommandSafe}), failing closed.
 *
 * This is a text check, not a sandbox. A script the agent wrote earlier and
 * then runs by name is not read; its effect on `/space` is bounded by the
 * mounts, not by this function.
 */

const SHARED_MOUNTS = ["/space", "/project", "/data", "/company"] as const;

/** A verb that removes, moves or overwrites in place. */
const DESTRUCTIVE_RE = new RegExp(
  [
    String.raw`\b(rm|rmdir|unlink|shred|mv|truncate)\b`,
    String.raw`\bdd\b[^|;&]*\bof=`,
    String.raw`\bfind\b[^|;&]*\s-delete\b`,
    String.raw`\bgit\s+(clean|reset\s+--hard|checkout\s+--|restore)\b`,
  ].join("|")
);

const OUTBOUND_RES: readonly RegExp[] = [
  /\bgit\s+push\b/,
  // curl/wget that sends data or uses a method other than GET.
  /\bcurl\b[^|;&]*\s(-X\s*(POST|PUT|PATCH|DELETE)|--request\b|-d\b|--data\S*|-F\b|--form\b|-T\b|--upload-file\b|--json\b)/i,
  /\bwget\b[^|;&]*\s(--post-data|--post-file|--method)\b/,
  /\b(scp|sftp|ssh|rsync|nc|ncat|ftp|sendmail|mail)\b/,
];

const OPAQUE_RES: readonly RegExp[] = [
  /\beval\b/,
  /\$\(|`/,
  /\|\s*(sh|bash|zsh)\b/,
  /\bbase64\b[^|;&]*(-d|--decode)/,
];

function commandTouchesShared(command: string, cwd: string): boolean {
  const cwdShared = SHARED_MOUNTS.some(
    (mount) => cwd === mount || cwd.startsWith(`${mount}/`)
  );
  return (
    cwdShared ||
    // `..` and quoting can precede the mount, a word character cannot
    // (`/sandbox/space` is not `/space`).
    SHARED_MOUNTS.some((mount) =>
      new RegExp(String.raw`(^|[^\w-])${mount}(?![\w-])`).test(command)
    )
  );
}

/** Commands whose first word only reads. Anything else near `/space` is reviewed. */
const READ_ONLY_COMMANDS = new Set([
  "cat",
  "cd",
  "cut",
  "diff",
  "du",
  "echo",
  "file",
  "find",
  "grep",
  "head",
  "jq",
  "less",
  "ls",
  "pwd",
  "rg",
  "sed",
  "sort",
  "stat",
  "tail",
  "tree",
  "uniq",
  "wc",
]);
const WRITE_SIGNAL_RE = />|\s-exec\b|\s-i\b|\s-delete\b/;

function isPlainRead(command: string): boolean {
  if (WRITE_SIGNAL_RE.test(command)) {
    return false;
  }
  return command
    .split(/&&|\|\||[;|\n]/)
    .map((segment) => segment.trim().split(/\s+/)[0] ?? "")
    .filter(Boolean)
    .every((word) => READ_ONLY_COMMANDS.has(word));
}

export type SandboxCommandVerdict = "allow" | "ask" | "review";

/**
 * `ask`: a person decides. `allow`: it runs. `review`: it touches shared
 * files and is not plainly a read — the classifier decides.
 */
export function classifySandboxCommand(args: {
  command?: unknown;
  cwd?: unknown;
}): SandboxCommandVerdict {
  const command = typeof args.command === "string" ? args.command : "";
  const cwd = typeof args.cwd === "string" ? args.cwd.trim() : "";
  if (!command.trim()) {
    // Nothing readable to reason about.
    return "ask";
  }
  if (
    OPAQUE_RES.some((re) => re.test(command)) ||
    OUTBOUND_RES.some((re) => re.test(command))
  ) {
    return "ask";
  }
  if (!commandTouchesShared(command, cwd)) {
    return "allow";
  }
  if (DESTRUCTIVE_RE.test(command)) {
    return "ask";
  }
  return isPlainRead(command) ? "allow" : "review";
}
