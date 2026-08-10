/** Turn a capability id into a short readable label for pickers. */
export function humanizeCapability(capability: string): string {
  if (capability === "*") {
    return "All capabilities";
  }
  if (capability.endsWith(".*")) {
    return `${humanizeCapability(capability.slice(0, -2))} (all)`;
  }

  const parts = capability.split(".").filter(Boolean);
  const start =
    parts[0] === "module" || parts[0] === "core" || parts[0] === "tenant"
      ? 1
      : 0;
  const words = parts
    .slice(start)
    .flatMap((part) => part.split("-"))
    .filter(Boolean);

  if (words.length === 0) {
    return capability;
  }

  return words
    .map((word, index) =>
      index === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word
    )
    .join(" ");
}
