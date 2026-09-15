// What an agent can actually do at runtime, by layer — the assemble pipeline
// run dry. The Capabilities tab used to show the row's stored `tool_ids`
// (plus each skill's `allowed_tools`), which is one of four inputs: the floor
// every specialist stands on, the presentation and approval tools attached
// at assembly, and the Space's visibility filter are the other three. People
// read that list as "what the agent has" and were wrong in both directions.
import {
  FIRST_ENGENTY_SKILL_ID,
  FIRST_ENGENTY_TOOL_IDS,
} from "@engenty/ai-core";
import {
  agentCarriesCatalogFloor,
  LIVE_HIRE_SKILL_IDS,
  LIVE_HIRE_TOOL_IDS,
} from "../../../ai/tools/agent-hire-policy.js";
import { ENGENTY_TOOL_EXECUTE_TOOL_ID } from "../../../ai/tools/engenty-tools/engenty-tool-execute-tool.js";
import { ENGENTY_TOOLS_PREAPPROVE_TOOL_ID } from "../../../ai/tools/engenty-tools/engenty-tools-preapprove-tool.js";
import { isToolVisibleInSpace } from "../../../ai/tools/engenty-tools/lib/space-gate.js";
import { nativeModuleToolMeta } from "../native-module-tool-meta.js";
import {
  type RunSpaceResolution,
  toolsSpaceFromResolution,
} from "../sessions/run-space.js";
import type { AgentConfig, AiRegistry } from "./types.js";

/** The presentation set every root specialist gets at assembly. */
export const ASSEMBLY_PRESENTATION_TOOL_IDS = [
  "show_artifact",
  "show_objects",
  "show_ui",
  "show_widget",
] as const;

export interface EffectiveCapabilityLayers {
  /** Declared on the row / manifest, beyond the floor. */
  agent: string[];
  /** Attached at assembly, never declared: presentation, bulk approval. */
  attached: string[];
  /** The catalog floor every specialist stands on (+ the lead's hire set). */
  default: string[];
  /**
   * Declared or floor tools the Space's visibility filter HIDES this run —
   * a module tool whose module is not mounted here. Null when no Space was
   * asked about.
   */
  space_hidden: string[] | null;
}

export interface EffectiveSkillLayers {
  agent: string[];
  default: string[];
  /** The Space's own mounted skills; null when no Space was asked about. */
  space: string[] | null;
}

export interface EffectiveCapabilities {
  agent_id: string;
  /** Whether the floor applies — a specialist, hired or module-shipped. */
  carries_floor: boolean;
  skills: EffectiveSkillLayers;
  space_id: string | null;
  tools: EffectiveCapabilityLayers;
  /** Reports to nobody in this Space: carries the setup and hiring set. */
  top_level: boolean;
}

function unique(ids: Iterable<string>): string[] {
  return [...new Set([...ids].filter((id) => id.trim().length > 0))];
}

/**
 * Lay the agent's runtime tool and skill set out by layer. Pure over the
 * config and the (optional) resolved Space gate; the registry is only asked
 * for tool objects to read their module meta for the visibility layer.
 */
export async function resolveEffectiveCapabilities(input: {
  config: AgentConfig;
  registry?: Pick<AiRegistry, "getTool"> | null;
  /** The Space asked about, resolved the way a run resolves it; absent = none. */
  spaceResolution?: RunSpaceResolution | null;
  spaceId?: string | null;
}): Promise<EffectiveCapabilities> {
  const { config } = input;
  const carriesFloor = agentCarriesCatalogFloor(config);
  const resolution = input.spaceResolution ?? null;
  const resolvedSpace =
    resolution?.kind === "resolved" ? resolution.space : null;
  const gate = resolution ? toolsSpaceFromResolution(resolution) : null;
  const topLevel =
    config.source === "database" &&
    Boolean(resolvedSpace?.topLevelAgentIds.has(config.id));

  const floor = carriesFloor
    ? unique([
        ...LIVE_HIRE_TOOL_IDS,
        ...(topLevel ? FIRST_ENGENTY_TOOL_IDS : []),
      ])
    : [];
  const floorSet = new Set(floor);
  const declared = unique(config.toolIds).filter((id) => !floorSet.has(id));
  const declaredSet = new Set(declared);

  const attached: string[] = [];
  if (carriesFloor) {
    for (const id of ASSEMBLY_PRESENTATION_TOOL_IDS) {
      if (!(floorSet.has(id) || declaredSet.has(id))) {
        attached.push(id);
      }
    }
    if (
      (floorSet.has(ENGENTY_TOOL_EXECUTE_TOOL_ID) ||
        declaredSet.has(ENGENTY_TOOL_EXECUTE_TOOL_ID)) &&
      !(
        floorSet.has(ENGENTY_TOOLS_PREAPPROVE_TOOL_ID) ||
        declaredSet.has(ENGENTY_TOOLS_PREAPPROVE_TOOL_ID)
      )
    ) {
      attached.push(ENGENTY_TOOLS_PREAPPROVE_TOOL_ID);
    }
  }

  let spaceHidden: string[] | null = null;
  if (gate && input.registry) {
    spaceHidden = [];
    for (const id of [...floor, ...declared]) {
      const tool = await input.registry.getTool(id).catch(() => undefined);
      const meta = nativeModuleToolMeta(tool ?? undefined);
      if (!meta) {
        continue;
      }
      const visible = isToolVisibleInSpace(
        {
          operationId: meta.operationId,
          ...(meta.moduleId ? { moduleId: meta.moduleId } : {}),
        },
        gate
      );
      if (!visible) {
        spaceHidden.push(id);
      }
    }
  }

  const defaultSkills = carriesFloor
    ? unique([
        ...LIVE_HIRE_SKILL_IDS,
        ...(topLevel ? [FIRST_ENGENTY_SKILL_ID] : []),
      ])
    : [];
  const defaultSkillSet = new Set(defaultSkills);

  return {
    agent_id: config.id,
    carries_floor: carriesFloor,
    skills: {
      agent: unique(config.skillIds).filter((id) => !defaultSkillSet.has(id)),
      default: defaultSkills,
      space: resolvedSpace ? unique(resolvedSpace.surface.skills) : null,
    },
    space_id: input.spaceId ?? null,
    tools: {
      agent: declared,
      attached,
      default: floor,
      space_hidden: spaceHidden,
    },
    top_level: topLevel,
  };
}
