const revokedUntil = new Map<string, number>();

export function revokeTokenId(
  tokenId: string,
  expiresAtEpochSeconds?: number
): void {
  if (!tokenId) {
    return;
  }
  revokedUntil.set(tokenId, expiresAtEpochSeconds ?? Number.MAX_SAFE_INTEGER);
}

export function isTokenIdRevoked(tokenId: string | undefined): boolean {
  if (!tokenId) {
    return false;
  }
  const expiresAt = revokedUntil.get(tokenId);
  if (expiresAt == null) {
    return false;
  }
  const now = Math.floor(Date.now() / 1000);
  if (expiresAt < now) {
    revokedUntil.delete(tokenId);
    return false;
  }
  return true;
}
