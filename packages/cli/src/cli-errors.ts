import { dim, red } from "./env-setup/env-style.js";

type ErrorHint = (error: unknown) => string | undefined;

let hintForError: ErrorHint = () => undefined;

/**
 * The core CLI knows its API client's error shapes (not logged in, API down)
 * and registers a hint for them; the standalone package has none.
 */
export function setCliErrorHint(hint: ErrorHint): void {
  hintForError = hint;
}

/** Indent the wrapped lines of a multi-line message under the ✗. */
function indent(message: string): string {
  return message.split("\n").join("\n  ");
}

/**
 * Wrap a Commander action: a failure becomes a readable line on stderr (with a
 * hint under it when one is registered) and exit code 1 instead of a stack
 * trace. Every message here is read by a person — the CLI has no machine
 * callers on stderr, and the commands with machine output carry `--json`.
 */
export function runCliAction<A extends unknown[]>(
  fn: (...args: A) => Promise<void> | void
): (...args: A) => Promise<void> {
  return async (...args: A) => {
    try {
      await fn(...args);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const hint = hintForError(error);
      console.error(`${red("✗")} ${indent(message)}`);
      if (hint) {
        console.error(dim(`  ${indent(hint)}`));
      }
      process.exitCode = 1;
    }
  };
}
