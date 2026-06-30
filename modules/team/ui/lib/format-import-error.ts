import { ApiClientResponseError } from "@engenty/api-client";

export function formatImportRowError(err: unknown, fallback: string): string {
  if (err instanceof ApiClientResponseError) {
    if (err.fields && Object.keys(err.fields).length > 0) {
      return Object.entries(err.fields)
        .map(([field, messages]) => `${field}: ${messages.join(", ")}`)
        .join("; ");
    }
    if (err.message.trim()) {
      return err.message;
    }
  }
  if (err instanceof Error && err.message.trim()) {
    return err.message;
  }
  return fallback;
}
