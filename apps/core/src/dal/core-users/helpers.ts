import type { TenantRole } from "./types.js";

export function coerceRole(value: unknown): TenantRole {
  return value === "admin" ? "admin" : "member";
}

export function coerceIsSuperAdmin(value: unknown): boolean {
  return value === true;
}
