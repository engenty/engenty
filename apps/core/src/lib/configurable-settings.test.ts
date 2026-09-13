import { NON_CONFIGURABLE_ENV_KEYS } from "@engenty/cli";
import { describe, expect, it } from "vitest";
import { getConfigurableSettings } from "./configurable-settings.js";

describe("getConfigurableSettings", () => {
  const settings = getConfigurableSettings();
  const byKey = new Map(settings.map((s) => [s.key, s]));

  it("flags AI_GATEWAY_API_KEY as a platform secret", () => {
    const s = byKey.get("AI_GATEWAY_API_KEY");
    expect(s?.configurable).toBe("platform");
    expect(s?.secret).toBe(true);
    expect(s?.type).toBe("secret");
  });

  it("flags GOOGLE_OAUTH_CLIENT_ID as a tenant string", () => {
    const s = byKey.get("GOOGLE_OAUTH_CLIENT_ID");
    expect(s?.configurable).toBe("tenant");
    expect(s?.type).toBe("string");
  });

  it("treats SLACK_BOT_TOKEN as a platform secret", () => {
    // Bot tokens are read at boot with no tenant context, so they are
    // platform-scoped (hydrated into process.env), not tenant-overridable.
    const s = byKey.get("SLACK_BOT_TOKEN");
    expect(s?.configurable).toBe("platform");
    expect(s?.type).toBe("secret");
  });

  it("maps boolean toggles to the boolean type", () => {
    const s = byKey.get("ENGENTY_REMOTE_CHANNELS_ENABLED");
    expect(s?.configurable).toBe("platform");
    expect(s?.type).toBe("boolean");
  });

  it("never exposes a bootstrap secret as configurable", () => {
    for (const key of NON_CONFIGURABLE_ENV_KEYS) {
      expect(byKey.has(key)).toBe(false);
    }
  });
});
