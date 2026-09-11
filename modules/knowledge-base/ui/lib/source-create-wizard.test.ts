import { describe, expect, it } from "vitest";
import type { KbSourceAdapterDescriptor } from "../api.js";
import {
  defaultKbSourceWizardPlan,
  groupKbSourceWizardAdapters,
  KB_SOURCE_WIZARD_SAMPLE_SIZE,
  kbCreatedSourceId,
  kbSourceWizardGroupOf,
  kbSourceWizardIngestConfig,
  kbSourceWizardNextStep,
  kbSourceWizardPreviousStep,
  kbSourceWizardRemainingCount,
  kbSourceWizardSampleKeys,
  kbSourceWizardStepIndex,
  kbSourceWizardSteps,
  kbSourceWizardStrategy,
} from "./source-create-wizard.js";

function adapter(
  id: string,
  index_mode: KbSourceAdapterDescriptor["index_mode"] = "single"
): KbSourceAdapterDescriptor {
  return {
    id: id as KbSourceAdapterDescriptor["id"],
    index_mode,
    label: id,
    missing_item_strategies: ["ignore"],
    schedule_default_minutes: null,
    settings_fields: [],
  };
}

describe("kbSourceWizardSteps", () => {
  it("inserts the selection step only for adapters that index a list", () => {
    expect(kbSourceWizardSteps(adapter("sitemap", "review"))).toEqual([
      "type",
      "configure",
      "select",
      "fetch",
      "plan",
    ]);
  });

  it("skips selection for single-document adapters", () => {
    expect(kbSourceWizardSteps(adapter("url", "single"))).toEqual([
      "type",
      "configure",
      "fetch",
      "plan",
    ]);
  });

  it("skips selection while no adapter is chosen yet", () => {
    expect(kbSourceWizardSteps(undefined)).toEqual([
      "type",
      "configure",
      "fetch",
      "plan",
    ]);
  });
});

describe("step navigation", () => {
  const steps = kbSourceWizardSteps(adapter("sitemap", "review"));

  it("walks forward and stops at the last step", () => {
    expect(kbSourceWizardNextStep(steps, "type")).toBe("configure");
    expect(kbSourceWizardNextStep(steps, "plan")).toBe("plan");
  });

  it("walks back and stops at the first step", () => {
    expect(kbSourceWizardPreviousStep(steps, "fetch")).toBe("select");
    expect(kbSourceWizardPreviousStep(steps, "type")).toBe("type");
  });

  it("treats a step that is not in the sequence as the first one", () => {
    // `select` is absent once the user switches to a single-document adapter.
    const single = kbSourceWizardSteps(adapter("url", "single"));
    expect(kbSourceWizardStepIndex(single, "select")).toBe(0);
    expect(kbSourceWizardNextStep(single, "select")).toBe("configure");
  });
});

describe("kbSourceWizardSampleKeys", () => {
  it("caps the test run at the sample size", () => {
    const keys = Array.from({ length: 12 }, (_, i) => `k${i}`);
    expect(kbSourceWizardSampleKeys(keys)).toHaveLength(
      KB_SOURCE_WIZARD_SAMPLE_SIZE
    );
    expect(kbSourceWizardSampleKeys(keys)[0]).toBe("k0");
  });

  it("returns nothing for an empty selection, so a run is not scoped to zero items", () => {
    expect(kbSourceWizardSampleKeys([])).toEqual([]);
  });

  it("reports what the full sync still has to fetch", () => {
    expect(kbSourceWizardRemainingCount(["a", "b"])).toBe(0);
    expect(
      kbSourceWizardRemainingCount(Array.from({ length: 9 }, (_, i) => `k${i}`))
    ).toBe(4);
  });
});

describe("groupKbSourceWizardAdapters", () => {
  it("orders groups and drops empty ones", () => {
    const grouped = groupKbSourceWizardAdapters([
      adapter("manual"),
      adapter("url"),
      adapter("sitemap", "review"),
    ]);
    expect(grouped.map((row) => row.group)).toEqual(["web", "manual"]);
    expect(grouped[0]?.adapters.map((a) => a.id)).toEqual(["url", "sitemap"]);
  });

  it("keeps an adapter the group table has never heard of", () => {
    expect(kbSourceWizardGroupOf("notion_export")).toBe("other");
    const grouped = groupKbSourceWizardAdapters([adapter("notion_export")]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]?.group).toBe("other");
  });
});

describe("kbSourceWizardIngestConfig", () => {
  it("arms exactly the chosen mode", () => {
    const plan = defaultKbSourceWizardPlan();
    expect(kbSourceWizardIngestConfig(plan)).toMatchObject({
      agentic_active: false,
      authored_active: true,
    });
    expect(
      kbSourceWizardIngestConfig({ ...plan, agentic: true })
    ).toMatchObject({ agentic_active: true, authored_active: false });
  });

  it("arms neither mode when the user opts out of automatic runs", () => {
    const config = kbSourceWizardIngestConfig({
      ...defaultKbSourceWizardPlan(),
      active: false,
    });
    expect(config.agentic_active).toBe(false);
    expect(config.authored_active).toBe(false);
  });

  it("does not persist an authoring brief for the authored mode", () => {
    const config = kbSourceWizardIngestConfig({
      ...defaultKbSourceWizardPlan(),
      instructions: "  write a wiki  ",
    });
    expect(config.agentic_instructions).toBe("");
  });

  it("trims the brief it does persist", () => {
    const config = kbSourceWizardIngestConfig({
      ...defaultKbSourceWizardPlan(),
      agentic: true,
      instructions: "  write a wiki  ",
    });
    expect(config.agentic_instructions).toBe("write a wiki");
  });

  it("maps an unset category to null rather than an empty string", () => {
    expect(
      kbSourceWizardIngestConfig(defaultKbSourceWizardPlan()).category_id
    ).toBeNull();
  });
});

describe("kbSourceWizardStrategy", () => {
  it("resolves the grouping choice only when an agent is not authoring", () => {
    const plan = defaultKbSourceWizardPlan();
    expect(kbSourceWizardStrategy({ ...plan, scope: "per_source" })).toBe(
      "per_source"
    );
    expect(
      kbSourceWizardStrategy({ ...plan, agentic: true, scope: "per_source" })
    ).toBe("agentic");
  });
});

describe("kbCreatedSourceId", () => {
  it("reads the unwrapped shape the API client actually returns", () => {
    expect(kbCreatedSourceId({ id: "src-1", name: "Docs" })).toBe("src-1");
  });

  it("still reads the enveloped shape the type declares", () => {
    expect(kbCreatedSourceId({ data: { id: "src-2" } })).toBe("src-2");
  });

  it("throws rather than handing back undefined", () => {
    expect(() => kbCreatedSourceId({ data: {} })).toThrow(
      "kb_source_create_no_id"
    );
    expect(() => kbCreatedSourceId(null)).toThrow("kb_source_create_no_id");
  });
});

describe("kbSourceWizardIngestConfig — templates", () => {
  it("persists an explicit template binding", () => {
    const config = kbSourceWizardIngestConfig({
      ...defaultKbSourceWizardPlan(),
      templateId: "tpl-1",
      templateMode: "template",
    });
    expect(config).toMatchObject({
      template_id: "tpl-1",
      template_mode: "template",
    });
  });

  it("drops a stale id when the mode is not an explicit binding", () => {
    for (const templateMode of ["inherit", "none"] as const) {
      const config = kbSourceWizardIngestConfig({
        ...defaultKbSourceWizardPlan(),
        templateId: "tpl-1",
        templateMode,
      });
      expect(config.template_id).toBeNull();
      expect(config.template_mode).toBe(templateMode);
    }
  });

  it("does not claim a binding when the mode says template but no id was picked", () => {
    const config = kbSourceWizardIngestConfig({
      ...defaultKbSourceWizardPlan(),
      templateId: "",
      templateMode: "template",
    });
    expect(config.template_id).toBeNull();
  });

  it("inherits from the category by default", () => {
    expect(
      kbSourceWizardIngestConfig(defaultKbSourceWizardPlan()).template_mode
    ).toBe("inherit");
  });
});
