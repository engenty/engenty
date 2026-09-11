const TRAIL = /[.,;:!?]+$/;

/** Split a heading so a mascot can sit on one word. */
export function perchParts(
  title: string,
  word?: string
): [string, string, string] {
  const parts = title.split(/(\s+)/);
  const norm = (token: string) => token.replace(TRAIL, "");
  let index = -1;
  if (word) {
    index = parts.findIndex((part) => norm(part) === word);
  }
  if (index < 0) {
    for (let i = parts.length - 1; i >= 0; i -= 1) {
      if (norm(parts[i] ?? "").length > 0) {
        index = i;
        break;
      }
    }
  }
  if (index < 0) {
    return ["", title, ""];
  }
  return [
    parts.slice(0, index).join(""),
    parts[index] ?? "",
    parts.slice(index + 1).join(""),
  ];
}
