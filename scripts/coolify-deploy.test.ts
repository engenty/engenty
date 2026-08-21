import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const deployScript = path.join(
  repoRoot,
  "deploy",
  "scripts",
  "coolify-deploy.sh"
);

function makeFixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "engenty-blue-green-"));
  const bin = path.join(root, "bin");
  const state = path.join(root, "state");
  mkdirSync(bin);
  mkdirSync(state);

  const token = path.join(root, "token");
  const migrationEnv = path.join(root, "migration.env");
  const config = path.join(root, "blue-green.env");
  writeFileSync(token, "test-token\n");
  writeFileSync(migrationEnv, "SUPABASE_DB_URL=postgresql://example\n");
  writeFileSync(
    config,
    [
      "BLUE_APP_UUID=blue-uuid",
      "GREEN_APP_UUID=green-uuid",
      "BLUE_HEALTH_URL=https://blue.example.com",
      "GREEN_HEALTH_URL=https://green.example.com",
      "PUBLIC_APP_URL=https://app.example.com",
      "COOLIFY_URL=https://coolify.example.com",
      `COOLIFY_API_TOKEN_FILE=${token}`,
      `MIGRATION_ENV_FILE=${migrationEnv}`,
      "",
    ].join("\n")
  );
  writeFileSync(path.join(state, "active-color"), "blue\n");

  const curl = path.join(bin, "curl");
  writeFileSync(
    curl,
    `#!/usr/bin/env bash
url="\${!#}"
case "$url" in
  */start*) printf '%s\\n' '{"deployment_uuid":"deployment-1"}' ;;
  */deployments/*) printf '{"status":"%s"}\\n' "\${MOCK_DEPLOY_STATUS:-finished}" ;;
  *) printf '%s\\n' '{}' ;;
esac
`
  );
  chmodSync(curl, 0o755);

  const docker = path.join(bin, "docker");
  writeFileSync(docker, "#!/usr/bin/env bash\nexit 0\n");
  chmodSync(docker, 0o755);
  const sleep = path.join(bin, "sleep");
  writeFileSync(sleep, "#!/usr/bin/env bash\nexit 0\n");
  chmodSync(sleep, 0o755);
  const flock = path.join(bin, "flock");
  writeFileSync(flock, "#!/usr/bin/env bash\nexit 0\n");
  chmodSync(flock, 0o755);

  return { bin, config, state };
}

describe("coolify blue-green deploy script", () => {
  it("promotes the inactive color after migration and readiness", () => {
    const fixture = makeFixture();
    const result = spawnSync("bash", [deployScript], {
      encoding: "utf8",
      env: {
        ...process.env,
        ENGENTY_BLUE_GREEN_CONFIG: fixture.config,
        ENGENTY_DEPLOY_STATE_DIR: fixture.state,
        PATH: `${fixture.bin}:${process.env.PATH}`,
        SSH_ORIGINAL_COMMAND: "deploy v1.2.3",
      },
    });

    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("PROMOTED release=v1.2.3 color=green");
    expect(readFileSync(path.join(fixture.state, "active-color"), "utf8")).toBe(
      "green\n"
    );
  });

  it("rejects every command except a semantic release deployment", () => {
    const fixture = makeFixture();
    const result = spawnSync("bash", [deployScript], {
      encoding: "utf8",
      env: {
        ...process.env,
        ENGENTY_BLUE_GREEN_CONFIG: fixture.config,
        ENGENTY_DEPLOY_STATE_DIR: fixture.state,
        PATH: `${fixture.bin}:${process.env.PATH}`,
        SSH_ORIGINAL_COMMAND: "bash -i",
      },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("only 'deploy vX.Y.Z' is allowed");
  });

  it("keeps the active color and stops a failed candidate", () => {
    const fixture = makeFixture();
    const result = spawnSync("bash", [deployScript], {
      encoding: "utf8",
      env: {
        ...process.env,
        ENGENTY_BLUE_GREEN_CONFIG: fixture.config,
        ENGENTY_DEPLOY_STATE_DIR: fixture.state,
        MOCK_DEPLOY_STATUS: "failed",
        PATH: `${fixture.bin}:${process.env.PATH}`,
        SSH_ORIGINAL_COMMAND: "deploy v1.2.3",
      },
    });

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("ROLLBACK candidate=green");
    expect(readFileSync(path.join(fixture.state, "active-color"), "utf8")).toBe(
      "blue\n"
    );
  });
});
