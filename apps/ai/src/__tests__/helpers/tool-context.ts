/**
 * Mastra 1.55 changed `Tool.execute` from `(input)` to `(input, context)`.
 * The tools exercised in these tests read only their input — they resolve
 * tenant/thread scope from the ALS run context instead — so an empty context
 * is the honest stand-in for "this call never touches it".
 *
 * Kept in one place on purpose: the day a tool under test starts reading the
 * execution context, there is a single seam to build a real one in, rather
 * than a dozen scattered `as never` casts to hunt down.
 */
export function testToolContext<TContext>(): TContext {
  return {} as TContext;
}
