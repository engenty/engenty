// Demo phase agent (PLAN-agent-hooks Phase 3 proof): a three-phase triage
// workflow driven by useMachine — per-phase model tier, per-phase skill
// hints, and transition tools that persist thread state. Registered only
// when ENGENTY_DEMO_AGENTS=1 so it never shows in tenant catalogs by
// default.
import type { AgentFnDescriptor } from "@engenty/ai-core";
import { useMachine, usePurpose, useSkillHint } from "@engenty/ai-core";

export const ISSUE_TRIAGE_DEMO_AGENT_ID = "engenty.issue-triage-demo";

export const issueTriageDemoAgent: AgentFnDescriptor = {
  description:
    "Demo: phased issue triage (reproduce → diagnose → report) driven by durable thread state.",
  fn: () => {
    const machine = useMachine({
      initial: "reproduce",
      name: "step",
      phases: ["reproduce", "diagnose", "report"] as const,
    });
    if (machine.phase === "reproduce") {
      useSkillHint("repro-checklist");
      machine.advance(
        "diagnose",
        "Call once the issue reproduces reliably and the repro steps are written down."
      );
    }
    if (machine.phase === "diagnose") {
      usePurpose("planning_coding");
      useSkillHint("debugging-guide");
      machine.advance(
        "report",
        "Call once the root cause is identified with evidence."
      );
    }
    return [
      "You are the Issue Triage demo agent.",
      "Work strictly within your current phase; use the transition tool when its exit condition is met.",
      "reproduce: gather facts and reproduce the issue. diagnose: find the root cause. report: write the final triage summary.",
    ].join("\n");
  },
  id: ISSUE_TRIAGE_DEMO_AGENT_ID,
  name: "Issue Triage (demo)",
};
