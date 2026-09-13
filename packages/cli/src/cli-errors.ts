type ErrorHint = (error: unknown) => string | undefined;

let hintForError: ErrorHint = () => undefined;

/**
 * The core CLI knows its API client's error shapes (not logged in, API down)
 * and registers a hint for them; the standalone package has none.
 */
export function setCliErrorHint(hint: ErrorHint): void {
  hintForError = hint;
}

/**
 * Wrap a Commander action: a failure becomes a one-line JSON error on stderr
 * (with a `hint` when one is registered) and exit code 1 instead of a stack
 * trace.
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
      console.error(
        JSON.stringify({ ok: false, error: message, ...(hint ? { hint } : {}) })
      );
      process.exitCode = 1;
    }
  };
}
