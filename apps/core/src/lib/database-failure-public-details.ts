import { resolveSupabaseConfig } from "../dal/supabase-config.js";

/**
 * Non-secret diagnostics for clients (hostname only, safe error codes/messages).
 */
export function buildPublicDatabaseFailureDetails(
  config: Record<string, unknown>,
  cause: unknown
): Record<string, string> {
  const details: Record<string, string> = {};
  try {
    const { url } = resolveSupabaseConfig(config);
    details.supabase_host = new URL(url).hostname;
  } catch {
    // Missing URL in config — omit host
  }

  if (cause && typeof cause === "object" && "code" in cause) {
    const code = (cause as { code: unknown }).code;
    if (typeof code === "string" && code.length > 0) {
      details.postgrest_or_db_code = code;
    }
  }

  if (cause instanceof Error && cause.message) {
    details.error_message = cause.message;
  } else if (cause && typeof cause === "object" && "message" in cause) {
    const message = (cause as { message: unknown }).message;
    if (typeof message === "string" && message.length > 0) {
      details.error_message = message;
    }
  }

  return details;
}
