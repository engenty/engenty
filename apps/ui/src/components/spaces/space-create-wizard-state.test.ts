import { describe, expect, it } from "vitest";
import {
  applyRecommendedModules,
  initialWizardSelection,
  nextWizardStep,
  optionalCount,
  previousWizardStep,
  templateDefaultVisibility,
  templateRecommendationKeys,
} from "./space-create-wizard-state";
import { toggleSelection } from "./space-setup-selection";

const BASELINE = [
  {
    agentAccess: "write" as const,
    resourceKey: "tasks",
    resourceType: "module" as const,
  },
  {
    resourceKey: "engenty.copilot",
    resourceType: "agent" as const,
  },
];

describe("space create wizard state", () => {
  it("starts from the required baseline, not a template's full mount list", () => {
    const selection = initialWizardSelection(BASELINE);
    expect([...selection.keys()]).toEqual([
      "module:tasks",
      "agent:engenty.copilot",
    ]);
  });

  it("counts only choices beyond the baseline", () => {
    const selection = toggleSelection(
      initialWizardSelection(BASELINE),
      { resourceKey: "contacts", resourceType: "module" },
      true
    );
    expect(optionalCount(selection, BASELINE, "module")).toBe(1);
    expect(optionalCount(selection, BASELINE, "agent")).toBe(0);
  });

  it("moves forwards and backwards without skipping steps", () => {
    expect(nextWizardStep("basics")).toBe("modules");
    expect(nextWizardStep("modules")).toBe("capabilities");
    expect(nextWizardStep("review")).toBe("review");
    expect(nextWizardStep("engenty")).toBe("engenty");
    expect(previousWizardStep("review")).toBe("capabilities");
    expect(previousWizardStep("capabilities")).toBe("modules");
  });

  it("makes the private-work template private by default", () => {
    expect(templateDefaultVisibility("personal")).toBe("private");
    expect(templateDefaultVisibility("client")).toBe("open");
  });

  it("uses curated recommendations across mixed API deployments", () => {
    // Tasks is featured, never baseline.
    expect([...templateRecommendationKeys("client")]).toEqual([
      "module:tasks",
      "module:projects",
      "module:contacts",
    ]);
    expect([...templateRecommendationKeys("blank")]).toEqual([]);
    expect([...templateRecommendationKeys("client", [])]).toEqual([]);
    expect([
      ...templateRecommendationKeys("client", ["module:offers"]),
    ]).toEqual(["module:offers"]);
  });

  it("clears featured modules when switching to blank", () => {
    const client = applyRecommendedModules(
      initialWizardSelection(BASELINE),
      templateRecommendationKeys("client"),
      new Set()
    );
    const blank = applyRecommendedModules(
      client.selection,
      templateRecommendationKeys("blank"),
      client.applied
    );
    expect(blank.selection.has("module:projects")).toBe(false);
    expect(blank.selection.has("module:contacts")).toBe(false);
    expect([...blank.applied]).toEqual([]);
  });

  it("preselects nothing extra for the blank template", () => {
    const { applied, selection } = applyRecommendedModules(
      initialWizardSelection(BASELINE),
      templateRecommendationKeys("blank"),
      new Set()
    );
    expect([...applied]).toEqual([]);
    expect([...selection.keys()]).toEqual([
      "module:tasks",
      "agent:engenty.copilot",
    ]);
  });

  it("preselects a template's featured modules on top of the baseline", () => {
    const { applied, selection } = applyRecommendedModules(
      initialWizardSelection(BASELINE),
      templateRecommendationKeys("client"),
      new Set()
    );
    expect([...applied].sort()).toEqual([
      "module:contacts",
      "module:projects",
      "module:tasks",
    ]);
    expect(selection.has("module:projects")).toBe(true);
    expect(selection.has("module:contacts")).toBe(true);
    expect(selection.has("module:tasks")).toBe(true);
    expect(selection.has("agent:tasks.assist")).toBe(false);
  });

  it("replaces featured modules when the template changes and keeps extras", () => {
    const client = applyRecommendedModules(
      initialWizardSelection(BASELINE),
      templateRecommendationKeys("client"),
      new Set()
    );
    const withExtra = toggleSelection(
      client.selection,
      { resourceKey: "inbox", resourceType: "module" },
      true
    );
    const research = applyRecommendedModules(
      withExtra,
      templateRecommendationKeys("research"),
      client.applied
    );
    expect(research.selection.has("module:projects")).toBe(false);
    expect(research.selection.has("module:contacts")).toBe(false);
    expect(research.selection.has("module:knowledge-base")).toBe(true);
    expect(research.selection.has("module:inbox")).toBe(true);
  });

  it("does not put back a featured module the user already removed", () => {
    const client = applyRecommendedModules(
      initialWizardSelection(BASELINE),
      templateRecommendationKeys("client"),
      new Set()
    );
    const removed = toggleSelection(
      client.selection,
      { resourceKey: "contacts", resourceType: "module" },
      false
    );
    const again = applyRecommendedModules(
      removed,
      templateRecommendationKeys("client"),
      client.applied
    );
    expect(again.selection.has("module:contacts")).toBe(false);
    expect(again.selection.has("module:projects")).toBe(true);
  });
});
