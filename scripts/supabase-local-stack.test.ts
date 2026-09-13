import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  applyLocalStackIdentity,
  configuredPorts,
  DEFAULT_SUPABASE_PROJECT_ID,
  detectPortOffset,
  materializeSupabaseConfig,
  parseProjectId,
  projectIdError,
} from "./lib/supabase-local-stack.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

function template(): string {
  return fs.readFileSync(
    path.join(repoRoot, "supabase", "config.toml.example"),
    "utf-8"
  );
}

describe("projectIdError", () => {
  it("accepts the default and other CLI-legal ids", () => {
    expect(projectIdError(DEFAULT_SUPABASE_PROJECT_ID)).toBeNull();
    expect(projectIdError("engenty_oss2")).toBeNull();
  });

  it("rejects empty, uppercase and leading-dash ids", () => {
    expect(projectIdError("")).not.toBeNull();
    expect(projectIdError("Engenty")).not.toBeNull();
    expect(projectIdError("-oss")).not.toBeNull();
  });
});

describe("configuredPorts", () => {
  it("reads the committed template's live ports", () => {
    expect(configuredPorts(template()).sort()).toEqual([
      54_320, 54_321, 54_322, 54_323, 54_324, 54_327, 54_329,
    ]);
  });

  it("ignores commented-out ports", () => {
    expect(configuredPorts("# smtp_port = 54325\nport = 54321\n")).toEqual([
      54_321,
    ]);
  });
});

describe("applyLocalStackIdentity", () => {
  it("renames the stack without moving it when there is no offset", () => {
    const out = applyLocalStackIdentity(template(), {
      projectId: "engenty-oss",
    });
    expect(out).toContain('project_id = "engenty-oss"');
    expect(configuredPorts(out)).toEqual(configuredPorts(template()));
  });

  it("shifts the whole 543xx band, commented ports included", () => {
    const out = applyLocalStackIdentity(template(), {
      portOffset: 1000,
      projectId: "engenty-oss",
    });
    // Read the lines directly: configuredPorts answers for the template's own
    // band, which the shifted file has by definition left.
    const shifted = [...out.matchAll(/^\s*port\s*=\s*(\d+)$/gm)]
      .map((match) => Number(match[1]))
      .sort();
    expect(shifted).toEqual([55_321, 55_322, 55_323, 55_324, 55_327, 55_329]);
    expect(out).toContain("shadow_port = 55320");
    expect(out).toContain("# smtp_port = 55325");
  });

  it("leaves ports outside the local band alone", () => {
    // `# port = 587` is the outbound SMTP port of a real mail provider, and
    // `inspector_port` is the edge runtime's — neither belongs to the stack.
    const out = applyLocalStackIdentity(template(), {
      portOffset: 1000,
      projectId: "engenty-oss",
    });
    expect(out).toContain("# port = 587");
    expect(out).toContain("inspector_port = 8083");
  });
});

describe("materializeSupabaseConfig", () => {
  function workspace(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "engenty-stack-"));
    fs.mkdirSync(path.join(root, "supabase"));
    fs.writeFileSync(
      path.join(root, "supabase", "config.toml.example"),
      template(),
      "utf-8"
    );
    return root;
  }

  function configOf(root: string): string {
    return fs.readFileSync(path.join(root, "supabase", "config.toml"), "utf-8");
  }

  it("writes the template's own stack when the wizard set nothing", () => {
    const root = workspace();
    expect(materializeSupabaseConfig(root, false, {})).toBe(
      DEFAULT_SUPABASE_PROJECT_ID
    );
    expect(configOf(root)).toEqual(template());
  });

  it("writes the wizard's stack on its own port band", () => {
    const root = workspace();
    expect(
      materializeSupabaseConfig(root, false, {
        ENGENTY_SUPABASE_PORT_OFFSET: "2000",
        ENGENTY_SUPABASE_PROJECT_ID: "engenty-oss",
      })
    ).toBe("engenty-oss");
    const config = configOf(root);
    expect(config).toContain('project_id = "engenty-oss"');
    expect(config).toContain("port = 56321");
  });

  it("keeps an existing config unless asked to refresh", () => {
    const root = workspace();
    materializeSupabaseConfig(root, false, {});
    expect(
      materializeSupabaseConfig(root, false, {
        ENGENTY_SUPABASE_PROJECT_ID: "engenty-oss",
      })
    ).toBe(false);
    expect(configOf(root)).toContain(
      `project_id = "${DEFAULT_SUPABASE_PROJECT_ID}"`
    );
  });

  it("refreshes from the pristine template, never shifting twice", () => {
    const root = workspace();
    const env = {
      ENGENTY_SUPABASE_PORT_OFFSET: "1000",
      ENGENTY_SUPABASE_PROJECT_ID: "engenty-oss",
    };
    materializeSupabaseConfig(root, false, env);
    materializeSupabaseConfig(root, true, env);
    expect(configOf(root)).toContain("port = 55321");
  });
});

describe("detectPortOffset", () => {
  it("reads back the band a config was written on", () => {
    const shifted = applyLocalStackIdentity(template(), {
      portOffset: 3000,
      projectId: "engenty-oss",
    });
    expect(detectPortOffset(shifted, template())).toBe(3000);
    expect(parseProjectId(shifted)).toBe("engenty-oss");
  });

  it("reports the template's own band as no offset", () => {
    expect(detectPortOffset(template(), template())).toBe(0);
  });
});
