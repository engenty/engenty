import type {
  AiAgentEntry,
  AiRegisteredAction,
  AiSkillCatalogEntry,
} from "../../lib/admin/ai-runtime-api";

export interface ResolvedSkillItem {
  actionNames: string[];
  allowed_tools: string[];
  compatibility: string | null;
  description: string | null;
  fromAgent: boolean;
  /** Stable skill key from the agent/actions registry (for catalog routes). */
  id: string;
  isKnown: boolean;
  license: string | null;
  metadata: AiSkillCatalogEntry["metadata"];
  name: string;
  origins: AiSkillCatalogEntry["origins"];
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}

function prettifySkillId(skillId: string) {
  return skillId
    .split(/[-_.]/g)
    .map((part) =>
      part.length > 0 ? `${part[0]!.toUpperCase()}${part.slice(1)}` : part
    )
    .join(" ");
}

function buildSkillItems(params: {
  actionSkillMap: Map<string, string[]>;
  catalog: AiSkillCatalogEntry[];
  directSkillIds: string[];
  t: (key: string) => string;
}) {
  const catalogById = new Map(
    params.catalog.map((skill) => [skill.name, skill])
  );
  const actionSkillIds = Array.from(params.actionSkillMap.keys());
  const allSkillIds = unique([...params.directSkillIds, ...actionSkillIds]);

  return allSkillIds.map((skillId) => {
    const catalogEntry = catalogById.get(skillId);
    const actionNames = params.actionSkillMap.get(skillId) ?? [];
    const fromAgent = params.directSkillIds.includes(skillId);
    if (catalogEntry) {
      return {
        actionNames,
        allowed_tools: catalogEntry.allowed_tools,
        compatibility: catalogEntry.compatibility,
        description: catalogEntry.description,
        fromAgent,
        id: skillId,
        isKnown: true,
        license: catalogEntry.license,
        metadata: catalogEntry.metadata,
        name: catalogEntry.name,
        origins: catalogEntry.origins,
      } satisfies ResolvedSkillItem;
    }
    return {
      actionNames,
      allowed_tools: [],
      compatibility: null,
      description: params.t("skills.unknownDescription"),
      fromAgent,
      id: skillId,
      isKnown: false,
      license: null,
      metadata: {},
      name: prettifySkillId(skillId),
      origins: [],
    } satisfies ResolvedSkillItem;
  });
}

export function getResolvedAgentSkillItems(params: {
  actions: AiRegisteredAction[];
  agent: AiAgentEntry;
  skills: AiSkillCatalogEntry[];
  t: (key: string) => string;
}): {
  actionDerivedSkills: ResolvedSkillItem[];
  agentSkills: ResolvedSkillItem[];
  effectiveSkills: ResolvedSkillItem[];
} {
  const actionSkillMap = new Map<string, string[]>();
  for (const action of params.actions) {
    for (const skillId of action.skills ?? []) {
      const names = actionSkillMap.get(skillId) ?? [];
      names.push(action.name);
      actionSkillMap.set(skillId, unique(names));
    }
  }

  const allSkills = buildSkillItems({
    catalog: params.skills,
    directSkillIds: unique(params.agent.skills ?? []),
    actionSkillMap,
    t: params.t,
  });
  const agentSkills = allSkills.filter((skill) => skill.fromAgent);
  const actionDerivedSkills = allSkills.filter(
    (skill) => skill.actionNames.length > 0
  );
  return {
    agentSkills,
    actionDerivedSkills,
    effectiveSkills: allSkills,
  };
}
