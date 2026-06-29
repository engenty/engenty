/**
 * Named validator registry for env vars contributed via `engenty.plugin.json`.
 * JSON manifests cannot hold functions, so a contributed var names a validator
 * by string (e.g. `"validate": "url"`); the loader resolves it to a function
 * here. Core's own TS manifest entries may keep inline function validators.
 */

/** Reusable: an http(s) URL. */
export function isHttpUrl(value: string): string | undefined {
  return /^https?:\/\//.test(value) ? undefined : "Must be an http(s):// URL.";
}

/** Reusable: base64 decoding to exactly 32 bytes (AES-256 key). */
export function validateBase64_32(value: string): string | undefined {
  try {
    if (Buffer.from(value, "base64").byteLength === 32) {
      return;
    }
  } catch {
    // fall through
  }
  return "Must be base64 decoding to exactly 32 bytes (engenty env generate).";
}

/** Reusable: at least 32 characters. */
export function validateMin32(value: string): string | undefined {
  return value.length >= 32 ? undefined : "Must be at least 32 characters.";
}

export type ValidatorName = "url" | "base64-32" | "min-32";

const REGISTRY: Record<ValidatorName, (value: string) => string | undefined> = {
  "base64-32": validateBase64_32,
  "min-32": validateMin32,
  url: isHttpUrl,
};

/** Resolve a named validator from a contributed manifest. Throws on unknown name. */
export function resolveValidator(
  name: string
): (value: string) => string | undefined {
  const fn = REGISTRY[name as ValidatorName];
  if (!fn) {
    throw new Error(
      `Unknown env validator "${name}" (expected one of: ${Object.keys(REGISTRY).join(", ")}).`
    );
  }
  return fn;
}
