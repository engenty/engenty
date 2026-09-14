import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(here, "../../../..");

describe("dev preflight domain", () => {
  it("forwards --domain into the port checker", () => {
    const cli = fs.readFileSync(path.join(here, "dev-commands.ts"), "utf8");
    expect(cli).toContain('script: "scripts/predev-check.sh"');
    expect(cli).toMatch(/`--domain=\$\{options\.domain\}`/);

    const sh = fs.readFileSync(
      path.join(workspaceRoot, "scripts/predev-check.sh"),
      "utf8"
    );
    expect(sh).toMatch(/PORT_CHECK_ARGS\+=\(--domain="\$DOMAIN_ARG"\)/);
    expect(sh).toMatch(/dev-port-check\.mjs" "\$\{PORT_CHECK_ARGS\[@\]\}"/);
  });
});
