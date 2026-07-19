import type { OpenAPIHono } from "@hono/zod-openapi";

/**
 * Public bootstrap config for the desktop shell.
 *
 * The Tauri desktop app bundles the web SPA without baked `VITE_*` values;
 * after the user picks a server it calls this endpoint to learn the public
 * client config (Supabase URL + anon key, API/AI base URLs). Everything
 * returned here is public by design — it is the same data baked into the
 * browser bundle of a web deployment.
 */
export function registerDesktopBootstrapRoutes(params: {
  app: OpenAPIHono;
  config: Record<string, unknown>;
}) {
  const { app, config } = params;

  app.get("/api/desktop/bootstrap", (c) => {
    const requestOrigin = new URL(c.req.url).origin;
    const supabaseUrl =
      (config.supabaseUrl as string) ||
      process.env.SUPABASE_URL ||
      process.env.VITE_SUPABASE_URL ||
      "";
    const supabaseAnonKey =
      (config.supabaseAnonKey as string) ||
      process.env.SUPABASE_ANON_KEY ||
      process.env.VITE_SUPABASE_ANON_KEY ||
      "";
    const apiBaseUrl =
      (config.apiBaseUrl as string) ||
      process.env.ENGENTY_API_BASE_URL ||
      requestOrigin;
    const aiBaseUrl =
      (config.aiBaseUrl as string) ||
      process.env.ENGENTY_AI_BASE_URL ||
      process.env.VITE_ENGENTY_AI_BASE_URL ||
      requestOrigin;
    if (!(supabaseUrl && supabaseAnonKey)) {
      return c.json(
        {
          error:
            "Desktop bootstrap is not configured on this server (missing SUPABASE_URL / SUPABASE_ANON_KEY).",
          ok: false,
        },
        503
      );
    }
    return c.json({
      config: {
        aiBaseUrl,
        apiBaseUrl,
        supabaseAnonKey,
        supabaseUrl,
      },
      ok: true,
      server: {
        name: "engenty",
        ...(process.env.ENGENTY_VERSION
          ? { version: process.env.ENGENTY_VERSION }
          : {}),
      },
    });
  });
}
