/**
 * Small repairs on text that has been through an editor, applied at the save
 * boundary.
 *
 * A rich editor does not hand back the bytes it was given: it parses to a
 * document and re-serializes, so the whole file is normalized whether or not
 * the writer touched that part. Most of that is the price of a WYSIWYG editor
 * and is not fixable here — but the trailing newline is both the most visible
 * instance and the cheapest to keep honest.
 */

/**
 * Give `next` the same trailing-newline state the file already had.
 *
 * Only ever ADDS, and only when the original had one: a markdown serializer
 * that emits no final newline turns every save of a POSIX-normal file into a
 * one-byte diff, which is noise in any diff, review or version history.
 *
 * Deliberately not "always end with a newline": a file that arrived without one
 * did not ask to be changed, and this is a save path, not a formatter. And
 * deliberately not stripping extras either — a blank line at the end of a
 * document is content someone typed, and the CSV serializer's own trailing
 * newline must survive untouched.
 */
export function preserveTrailingNewline(
  original: string,
  next: string
): string {
  if (!original.endsWith("\n")) {
    return next;
  }
  return next.endsWith("\n") ? next : `${next}\n`;
}
