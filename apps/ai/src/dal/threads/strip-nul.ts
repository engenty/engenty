// Postgres cannot store U+0000: `jsonb` refuses the `\u0000` escape and `text`
// refuses the byte. A tool that relays raw process output (a background
// command, a binary file read as text) can carry one, and a single one fails
// every later write of that message — the run aborts mid-turn. So every
// message write drops them; nothing a person or a model reads is lost.

const NUL = "\u0000";

/** `value` with every U+0000 removed from its strings, keys included. */
export function stripNul<T>(value: T): T {
  if (typeof value === "string") {
    return (value.includes(NUL) ? value.replaceAll(NUL, "") : value) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => stripNul(item)) as T;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        stripNul(key),
        stripNul(item),
      ])
    ) as T;
  }
  return value;
}
