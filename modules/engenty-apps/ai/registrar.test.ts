import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { appsAiRegistration, appsDynamicAiCapability } from "./registrar.js";

const here = import.meta.dirname;

describe("engenty-apps AI registration", () => {
  it("registers the engenty.coder agent", () => {
    // Filesystem-discovered agents land in `dynamic.agent_configs`;
    // `agents` carries only code-level AgentDefinitions.
    const registration = appsAiRegistration();
    const ids = (registration.dynamic?.agent_configs ?? []).map(
      (config) => config.id
    );
    expect(ids).toContain("engenty.coder");
  });

  it("attaches the identity document from AGENTS.md", () => {
    const registration = appsAiRegistration();
    const coder = (registration.dynamic?.agent_configs ?? []).find(
      (config) => config.id === "engenty.coder"
    );
    expect(coder?.instructions).toContain("You are the Coder for engenty");
    // The credential wall is doctrine, not just plumbing — if this line is
    // ever dropped the agent stops knowing why it has no tenant access.
    expect(coder?.instructions).toContain("You do not run engenty");
  });

  it("exposes a dynamic capability for apps/ai to assemble", () => {
    expect(appsDynamicAiCapability()).toBeTruthy();
  });

  it("does not hardcode a model — that is an override's job", () => {
    // define-module-ai rejects a model in agent.json; assert it directly so a
    // future edit fails here with a clear reason rather than at module load.
    const manifest = JSON.parse(
      readFileSync(join(here, "agents/engenty.coder/agent.json"), "utf8")
    ) as Record<string, unknown>;
    expect(manifest.model).toBeUndefined();
  });

  it("gives the coder catalog reach but no direct app-approval tools", () => {
    const manifest = JSON.parse(
      readFileSync(join(here, "agents/engenty.coder/agent.json"), "utf8")
    ) as { tools: string[] };
    expect(manifest.tools).toContain("engenty_tool_execute");
    // The coder proposes; a human holding apps.approve activates. Listing an
    // approval tool here would not grant the capability, but it would signal
    // the wrong thing to the model.
    expect(manifest.tools).not.toContain("app_release_approve");
    expect(manifest.tools).not.toContain("app_release_rollback");
  });

  it("ships both authoring skills", () => {
    const manifest = JSON.parse(
      readFileSync(join(here, "agents/engenty.coder/agent.json"), "utf8")
    ) as { skills: string[] };
    expect(manifest.skills).toEqual(["app-authoring", "engenty-bridge"]);
    for (const skill of manifest.skills) {
      const body = readFileSync(join(here, `skills/${skill}/SKILL.md`), "utf8");
      expect(body.startsWith("---")).toBe(true);
      expect(body).toContain(`name: ${skill}`);
    }
  });
});
