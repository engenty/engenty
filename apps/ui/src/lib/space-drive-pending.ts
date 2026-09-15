/**
 * Combine the Drive's independent reads into one pending flag.
 *
 * TanStack Query v5 keeps a disabled query at `isPending: true` forever
 * (`status: 'pending'`, `fetchStatus: 'idle'`). Projects is gated on the
 * space surface, so treating that query's `isPending` as a source would
 * spin the Data hub forever in a space that does not mount Projects.
 */
export function isSpaceDrivePending(input: {
  artifactsPending: boolean;
  dataRootsPending: boolean;
  enabled: boolean;
  projectsMounted: boolean;
  projectsPending: boolean;
  surfacePending: boolean;
}): boolean {
  if (!input.enabled) {
    return true;
  }
  return (
    input.surfacePending ||
    (input.projectsMounted && input.projectsPending) ||
    input.artifactsPending ||
    input.dataRootsPending
  );
}
