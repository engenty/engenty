import {
  CreditCard,
  KeyRound,
  ListOrdered,
  Lock,
  StickyNote,
} from "lucide-react";
import type { ComponentType } from "react";
import type { SecretKind } from "../api.js";

/** Per-kind icon, mirroring engrdian: Lock for credentials, Key for api keys. */
export const SECRET_KIND_ICONS: Record<
  SecretKind,
  ComponentType<{ className?: string }>
> = {
  username_password: Lock,
  api_key: KeyRound,
  key_list: ListOrdered,
  credit_card: CreditCard,
  note: StickyNote,
};

export const SECRET_KIND_LABEL_KEYS: Record<SecretKind, string> = {
  username_password: "kind.username_password",
  api_key: "kind.api_key",
  key_list: "kind.key_list",
  credit_card: "kind.credit_card",
  note: "kind.note",
};

/** Payload fields whose values render masked until the eye toggle is used. */
const SENSITIVE_FIELDS = new Set([
  "password",
  "value",
  "key",
  "token",
  "secret",
  "cvv",
  "number",
  "content",
]);

export function isSensitiveField(field: string): boolean {
  return SENSITIVE_FIELDS.has(field.toLowerCase());
}

export function extractDomain(url: string | null): string | null {
  if (!url) {
    return null;
  }
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}
