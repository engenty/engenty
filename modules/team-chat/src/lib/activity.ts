/** Compact human line for a `tasks.task.activity` bus payload (doc §10.2). */
export function formatActivityLine(input: {
  event_type: unknown;
  payload?: Record<string, unknown> | null;
}): string {
  const detail = input.payload ?? {};
  const verb = String(input.event_type ?? "").replace(/^tasks\./, "");
  return [
    `Task ${verb.replaceAll("_", " ")}`,
    typeof detail.title === "string" ? `"${detail.title}"` : null,
    typeof detail.from === "string" && typeof detail.to === "string"
      ? `${detail.from} → ${detail.to}`
      : null,
    typeof detail.comment === "string"
      ? `“${String(detail.comment).slice(0, 120)}”`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
}
