/**
 * Normalizes Agent Skills `allowed-tools` values (space-delimited string or array)
 * into a deduplicated list. Returns `undefined` when absent or empty.
 *
 * @see https://agentskills.io/specification
 */
export function normalizeAllowedToolsInput(
  raw: string | string[] | undefined | null
): string[] | undefined {
  if (raw === undefined || raw === null) {
    return;
  }
  if (Array.isArray(raw)) {
    const next = [...new Set(raw.map((t) => String(t).trim()).filter(Boolean))];
    return next.length > 0 ? next : undefined;
  }
  const parts = String(raw).split(/\s+/u).filter(Boolean);
  const next = [...new Set(parts)];
  return next.length > 0 ? next : undefined;
}

/**
 * Intersects every non-empty allow list. Layers that are absent, null, or empty
 * impose no constraint. Returns `undefined` when nothing constrains; otherwise
 * the intersection (possibly empty when lists disagree).
 */
export function composeAllowedToolsIntersection(
  layers: Array<string[] | undefined | null>
): string[] | undefined {
  const active = layers
    .map((layer) =>
      layer?.length ? [...new Set(layer.map((t) => String(t).trim()))] : null
    )
    .filter((layer): layer is string[] => layer != null && layer.length > 0);
  if (active.length === 0) {
    return;
  }
  let acc = new Set(active[0]);
  for (let i = 1; i < active.length; i += 1) {
    const next = new Set(active[i]);
    acc = new Set([...acc].filter((id) => next.has(id)));
  }
  const result = [...acc];
  return result.length > 0 ? result : [];
}
