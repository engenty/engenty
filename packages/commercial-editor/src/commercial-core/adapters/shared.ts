export function buildAddressLine(
  parts: Array<string | null | undefined>
): string {
  return parts.filter(Boolean).join(", ");
}

export function buildZipCity(
  zip?: string | null,
  city?: string | null
): string {
  return `${zip || ""} ${city || ""}`.trim();
}
