export function formatEngentyActionSource(moduleId: string): string {
  const id = moduleId.trim() || "engenty-core";
  if (id === "engenty-core") {
    return "engenty/core";
  }
  return `engenty/${id}`;
}
