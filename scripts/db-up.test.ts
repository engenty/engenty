import { describe, expect, it } from "vitest";
// @ts-expect-error -- plain .mjs script, no type declarations
import { setSectionEnabled } from "./db-up.mjs";

const SAMPLE = `[realtime]
enabled = true

[studio]
enabled = true
# Port to use for Supabase Studio.
port = 54323

[analytics]
enabled = true
port = 54327
backend = "postgres"
`;

describe("db-up config patching", () => {
  it("flips only the named section's enabled key", () => {
    const out = setSectionEnabled(SAMPLE, "studio", false);
    expect(out).toContain("[studio]\nenabled = false");
    // The section above must not be collateral damage — `enabled = true` appears
    // a dozen times in a real config.toml and a greedy replace would hit them all.
    expect(out).toContain("[realtime]\nenabled = true");
    expect(out).toContain("[analytics]\nenabled = true");
  });

  it("keeps comments and ports intact", () => {
    const out = setSectionEnabled(SAMPLE, "analytics", false);
    expect(out).toContain("# Port to use for Supabase Studio.");
    expect(out).toContain("port = 54327");
    expect(out).toContain("[analytics]\nenabled = false");
  });

  it("round-trips both directions", () => {
    const off = setSectionEnabled(SAMPLE, "studio", false);
    const backOn = setSectionEnabled(off, "studio", true);
    expect(backOn).toBe(SAMPLE);
  });

  it("fails loudly rather than starting a stack that ignores the flag", () => {
    expect(() => setSectionEnabled("[db]\nport = 5432\n", "studio", false)).toThrow(
      /no \[studio\] enabled key/
    );
  });
});
