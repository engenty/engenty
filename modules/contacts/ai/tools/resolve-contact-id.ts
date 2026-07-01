export function resolveScopedContactId(
  id: string | undefined,
  scope: Record<string, unknown> | null | undefined
): string | undefined {
  const scopeContactId =
    typeof scope?.entityId === "string" && scope.entityId.trim().length > 0
      ? scope.entityId.trim()
      : undefined;
  const normalizedId = typeof id === "string" ? id.trim() : "";

  if (!normalizedId || normalizedId.toLowerCase() === "current") {
    return scopeContactId;
  }

  return normalizedId;
}
