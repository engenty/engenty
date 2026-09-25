import { describe, expect, it } from "vitest";
import {
  injectRuntimeEnv,
  renderRuntimeEnvScript,
  resolveUiRuntimeEnv,
} from "./prod-gateway-runtime-env.js";

describe("prod-gateway-runtime-env", () => {
  it("prefers the browser-facing VITE_ value over the container's own", () => {
    const resolved = resolveUiRuntimeEnv({
      SUPABASE_ANON_KEY: "anon-key",
      SUPABASE_URL: "http://supabase-kong:8000",
      VITE_SUPABASE_URL: "https://app.example.com/supabase",
    });

    // SUPABASE_URL is internal Docker DNS here — serving it to a browser would
    // produce an app that cannot reach auth at all.
    expect(resolved.VITE_SUPABASE_URL).toBe("https://app.example.com/supabase");
    expect(resolved.VITE_SUPABASE_ANON_KEY).toBe("anon-key");
  });

  it("injects after <head> so the script runs before the bundle", () => {
    const html = injectRuntimeEnv(
      '<!doctype html><html><head><script type="module" src="/a.js"></script></head></html>',
      { VITE_SUPABASE_URL: "https://example.supabase.co" }
    );

    expect(html.indexOf("__ENGENTY_RUNTIME_ENV__")).toBeLessThan(
      html.indexOf("/a.js")
    );
    expect(html.startsWith("<!doctype html>")).toBe(true);
  });

  it("cannot be closed out of its own script tag", () => {
    const script = renderRuntimeEnvScript({
      VITE_SUPABASE_URL: "</script><script>alert(1)</script>",
    });

    expect(script.match(/<\/script>/g)).toHaveLength(1);
    expect(script).toContain("\\u003c/script>");
  });
});
