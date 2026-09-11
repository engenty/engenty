/**
 * The client-visible settings the served UI reads at runtime instead of from
 * the values Vite baked in.
 *
 * An image built by CI cannot know the Supabase project or public URL of the
 * install that will run it, so a prebuilt image is only reusable if the browser
 * learns them when the page is served. The gateway writes them onto
 * `globalThis.__ENGENTY_RUNTIME_ENV__`, which `runtimeEnvOverride` already
 * consults ahead of `import.meta.env` — the same seam the desktop shell uses to
 * point a bundled SPA at a user-chosen server.
 *
 * Baked values still work: a key we cannot resolve is simply left out, and the
 * bundle falls back to what it was built with.
 */

const RUNTIME_ENV_GLOBAL = "__ENGENTY_RUNTIME_ENV__";

/**
 * Each key, and the environment variables it may come from, in order.
 *
 * The `VITE_*` name wins where it is set, because the browser-facing URL is not
 * always the one the containers use: `SUPABASE_URL` may be internal Docker DNS
 * that no browser can resolve. The non-prefixed names are the fallback for the
 * common single-origin install where they are the same.
 */
const RUNTIME_ENV_SOURCES: Record<string, string[]> = {
  VITE_ENGENTY_AI_BASE_URL: ["VITE_ENGENTY_AI_BASE_URL", "PUBLIC_APP_URL"],
  VITE_SUPABASE_ANON_KEY: ["VITE_SUPABASE_ANON_KEY", "SUPABASE_ANON_KEY"],
  VITE_SUPABASE_URL: ["VITE_SUPABASE_URL", "SUPABASE_URL"],
};

export function resolveUiRuntimeEnv(
  env: NodeJS.ProcessEnv = process.env
): Record<string, string> {
  const resolved: Record<string, string> = {};
  for (const [key, sources] of Object.entries(RUNTIME_ENV_SOURCES)) {
    for (const source of sources) {
      const value = env[source]?.trim();
      if (value) {
        resolved[key] = value;
        break;
      }
    }
  }
  return resolved;
}

/**
 * `</script>` inside a JSON string would close the tag we are writing, and
 * `<!--` opens an HTML comment that swallows the rest. Escaping the `<` keeps
 * the JSON valid while making both impossible.
 */
function escapeForScriptTag(json: string): string {
  return json.replace(/</g, "\\u003c");
}

export function renderRuntimeEnvScript(values: Record<string, string>): string {
  const json = escapeForScriptTag(JSON.stringify(values));
  return `<script>globalThis.${RUNTIME_ENV_GLOBAL}=Object.assign(globalThis.${RUNTIME_ENV_GLOBAL}||{},${json});</script>`;
}

/**
 * Put the script before any module the page loads, so the values are in place
 * by the time the bundle's first import reads them. Falls back to prepending
 * when the document has no `<head>` — a `<script>` ahead of `<!doctype>` would
 * throw the parser into quirks mode, so only do that if there is nothing else.
 */
export function injectRuntimeEnv(
  html: string,
  values: Record<string, string>
): string {
  if (Object.keys(values).length === 0) {
    return html;
  }
  const script = renderRuntimeEnvScript(values);
  const headOpen = html.match(/<head[^>]*>/i);
  if (headOpen?.index !== undefined) {
    const at = headOpen.index + headOpen[0].length;
    return html.slice(0, at) + script + html.slice(at);
  }
  return script + html;
}
