import { describe, expect, it } from "vitest";
import { registerAppsApi } from "../src/api/index.js";
import {
  makeFakeAppsRepo,
  makeFakeStore,
  makeMockApi,
} from "../src/api/test-helpers.js";
import { appsAiRegistration } from "./registrar.js";

/**
 * Phase 6 claims copilot and coordinator need no agent-assembly changes to use
 * Apps: the operations are ordinary catalog entries reachable through
 * engenty_tool_execute, and the usage skills are seeded module skills that any
 * agent can load on demand. These assert the claim rather than restating it.
 */

function operations() {
  const { api, serverOperations } = makeMockApi();
  registerAppsApi(api, makeFakeAppsRepo(makeFakeStore()));
  return new Map(serverOperations.map((op) => [op.operationId, op]));
}

describe("consumption surface", () => {
  it("exposes discovery, invocation and state reading as catalog operations", () => {
    const ops = operations();
    // Everything an agent needs, reachable through the catalog with no
    // per-agent tool wiring anywhere.
    for (const id of [
      "app_list",
      "app_actions_list",
      "app_call",
      "app_call_privileged",
      "app_data_get",
      "app_data_list",
    ]) {
      expect(ops.get(id), `${id} must be a catalog operation`).toBeDefined();
    }
  });

  it("keeps discovery cheap enough for an agent to always check first", () => {
    const ops = operations();
    for (const id of ["app_list", "app_actions_list"]) {
      expect(ops.get(id)?.riskLevel).toBe("low");
      expect(ops.get(id)?.requiresApproval).toBe(false);
    }
  });

  it("makes a headless privileged call pause rather than proceed", () => {
    // This is what turns a monthly batch into an approval prompt instead of a
    // silent commit — the contract, not any code in the run loop.
    expect(operations().get("app_call_privileged")?.requiresApproval).toBe(
      true
    );
  });

  it("seeds the consumption skills as module skills", () => {
    const skills = appsAiRegistration().dynamic?.skills ?? {};
    expect(Object.keys(skills)).toEqual(
      expect.arrayContaining(["app-usage", "app-batch"])
    );
  });

  it("stamps the owning module into seeded skills so module hints find them", () => {
    const skills = appsAiRegistration().dynamic?.skills ?? {};
    expect(skills["app-usage"]).toContain("engenty-apps");
  });

  it("tells the batch skill not to retry an approval pause", () => {
    // The single most likely headless failure mode: treating a pause as an
    // error and hammering the gate.
    const skills = appsAiRegistration().dynamic?.skills ?? {};
    expect(skills["app-batch"]).toMatch(/Do not retry it/);
  });
});
