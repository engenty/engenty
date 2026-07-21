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

/** Primary copyable value for the compact row preview (password, API key, …). */
export function primarySecretValue(
  kind: SecretKind,
  payload: Record<string, unknown>
): string | null {
  switch (kind) {
    case "username_password": {
      const password = payload.password;
      if (typeof password === "string" && password.length > 0) {
        return password;
      }
      const username = payload.username;
      return typeof username === "string" && username.length > 0
        ? username
        : null;
    }
    case "api_key": {
      for (const key of ["value", "key", "token", "secret"] as const) {
        const value = payload[key];
        if (typeof value === "string" && value.length > 0) {
          return value;
        }
      }
      return null;
    }
    case "credit_card": {
      const number = payload.number;
      return typeof number === "string" && number.length > 0 ? number : null;
    }
    case "note": {
      const content = payload.content;
      return typeof content === "string" && content.length > 0 ? content : null;
    }
    case "key_list": {
      const keys = payload.keys;
      if (!Array.isArray(keys) || keys.length === 0) {
        return null;
      }
      const first = keys[0] as { value?: unknown };
      return first.value == null ? null : String(first.value);
    }
    default:
      return null;
  }
}

/** Compact mask: first + last character with an ellipsis between. */
export function maskSecretValue(value: string): string {
  if (value.length === 0) {
    return "••••••••";
  }
  if (value.length === 1) {
    return `${value}…`;
  }
  if (value.length === 2) {
    return `${value[0]}…${value[1]}`;
  }
  return `${value[0]}…${value.at(-1)}`;
}
