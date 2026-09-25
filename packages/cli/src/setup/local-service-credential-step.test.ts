import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ensureLocalCredentialChildEnv,
  ensureLocalServiceCredential,
  parseEnsureLocalOutput,
  runLocalServiceCredentialStep,
} from "./local-service-credential-step.js";

function workspace(envLocal: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "engenty-setup-cred-"));
  fs.mkdirSync(path.join(root, "apps", "core"), { recursive: true });
  fs.writeFileSync(path.join(root, ".env.local"), envLocal);
  return root;
}

describe("parseEnsureLocalOutput", () => {
  it("reads the JSON line past the CLI's boot noise", () => {
    const output = [
      "16:59:21 INFO [engenty] Registered web ingest adapter",
      '{"credentialId":"c1","status":"kept"}',
    ].join("\n");
    expect(parseEnsureLocalOutput(output)).toEqual({
      credentialId: "c1",
      status: "kept",
    });
    expect(
      parseEnsureLocalOutput(
        '{"credentialId":"c2","reason":"unknown","secret":"c2.engsvc_x","status":"minted"}'
      )
    ).toEqual({
      credentialId: "c2",
      reason: "unknown",
      secret: "c2.engsvc_x",
      status: "minted",
    });
    expect(parseEnsureLocalOutput("✗ boom")).toBeNull();
  });
});

describe("ensureLocalCredentialChildEnv", () => {
  it("takes the three keys from the files, not from the parent process", () => {
    const root = workspace(
      "SUPABASE_URL=http://127.0.0.1:54321\nSUPABASE_SERVICE_ROLE_KEY=sb_secret_x\n"
    );
    const env = ensureLocalCredentialChildEnv(root, {
      ENGENTY_AI_SERVICE_SECRET: "stale.from-process",
      OTHER: "kept",
      SUPABASE_URL: "http://127.0.0.1:99999",
    });
    expect(env.SUPABASE_URL).toBe("http://127.0.0.1:54321");
    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBe("sb_secret_x");
    // Absent from the files = absent for the child, whatever this process holds.
    expect(env.ENGENTY_AI_SERVICE_SECRET).toBeUndefined();
    expect(env.OTHER).toBe("kept");
  });
});

describe("runLocalServiceCredentialStep", () => {
  it("writes a minted secret into .env.local and says what happened", () => {
    const root = workspace("SUPABASE_URL=http://127.0.0.1:54321\n");
    const written: string[] = [];
    const logs: string[] = [];
    const status = runLocalServiceCredentialStep({
      deps: {
        run: () => ({
          ok: true,
          output:
            'noise\n{"credentialId":"c9","reason":"missing","secret":"c9.engsvc_new","status":"minted"}',
        }),
        writeSecret: (value) => written.push(value),
      },
      log: (line) => logs.push(line),
      workspaceRoot: root,
    });
    expect(status).toBe("minted");
    expect(written).toEqual(["c9.engsvc_new"]);
    expect(logs.join("\n")).toContain(
      "Minted a local AI service credential (c9)"
    );
    expect(logs.join("\n")).toContain("none was configured");
  });

  it("leaves a live credential alone", () => {
    const root = workspace("SUPABASE_URL=http://127.0.0.1:54321\n");
    const written: string[] = [];
    const status = runLocalServiceCredentialStep({
      deps: {
        run: () => ({
          ok: true,
          output: '{"credentialId":"c1","status":"kept"}',
        }),
        writeSecret: (value) => written.push(value),
      },
      log: () => undefined,
      workspaceRoot: root,
    });
    expect(status).toBe("kept");
    expect(written).toEqual([]);
  });

  it("never fails setup: a broken check is reported with the manual command", () => {
    const root = workspace("SUPABASE_URL=http://127.0.0.1:54321\n");
    const logs: string[] = [];
    const status = runLocalServiceCredentialStep({
      deps: {
        run: () => ({
          ok: false,
          output: "✗ SUPABASE_SERVICE_ROLE_KEY is unset",
        }),
        wait: () => undefined,
        writeSecret: () => {
          throw new Error("must not write");
        },
      },
      log: (line) => logs.push(line),
      workspaceRoot: root,
    });
    expect(status).toBe("skipped");
    expect(logs.join("\n")).toContain("service-token ensure-local");
    expect(logs.join("\n")).toContain("SUPABASE_SERVICE_ROLE_KEY is unset");
  });

  it("rides out a stack that is still restarting after a reset", () => {
    const root = workspace("SUPABASE_URL=http://127.0.0.1:54321\n");
    const outputs = [
      { ok: false, output: "fetch failed: ECONNREFUSED" },
      { ok: false, output: "PGRST002 schema cache not ready" },
      {
        ok: true,
        output:
          '{"credentialId":"c-2","reason":"unknown","secret":"c-2.s","status":"minted"}',
      },
    ];
    const written: string[] = [];
    const status = runLocalServiceCredentialStep({
      deps: {
        run: () => outputs.shift() ?? { ok: false, output: "" },
        wait: () => undefined,
        writeSecret: (value) => written.push(value),
      },
      log: () => undefined,
      workspaceRoot: root,
    });
    expect(status).toBe("minted");
    expect(written).toEqual(["c-2.s"]);
  });
});

describe("ensureLocalServiceCredential", () => {
  it("runs the step when the root .env.local exists", () => {
    const root = workspace("SUPABASE_URL=http://127.0.0.1:54321\n");
    const written: string[] = [];
    const status = ensureLocalServiceCredential({
      deps: {
        run: () => ({
          ok: true,
          output:
            '{"credentialId":"c3","reason":"unknown","secret":"c3.engsvc_new","status":"minted"}',
        }),
        writeSecret: (value) => written.push(value),
      },
      log: () => undefined,
      workspaceRoot: root,
    });
    expect(status).toBe("minted");
    expect(written).toEqual(["c3.engsvc_new"]);
  });

  it("does nothing without a root .env.local", () => {
    const root = workspace("");
    fs.rmSync(path.join(root, ".env.local"));
    const status = ensureLocalServiceCredential({
      deps: {
        run: () => {
          throw new Error("must not run");
        },
        writeSecret: () => {
          throw new Error("must not write");
        },
      },
      workspaceRoot: root,
    });
    expect(status).toBe("no-env-file");
  });
});
