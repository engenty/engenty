export interface SkillsFindHit {
  already_in_space: boolean;
  already_installed: boolean;
  already_preferred: boolean;
  description?: string;
  name: string;
  ref: { id: string };
  tags?: string[];
  url: string;
  version?: string;
}

export interface SkillsFindOutput {
  attach: {
    agent: { can_prefer: boolean; id: string } | null;
    space: { id: string } | null;
  };
  ok: true;
  provider: { id: string; label: string };
  query: string;
  results: SkillsFindHit[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function parseHit(raw: unknown): SkillsFindHit | null {
  const record = asRecord(raw);
  const ref = asRecord(record?.ref);
  if (
    !(
      record &&
      ref &&
      typeof record.name === "string" &&
      typeof ref.id === "string" &&
      typeof record.url === "string"
    )
  ) {
    return null;
  }
  return {
    already_in_space: record.already_in_space === true,
    already_installed: record.already_installed === true,
    already_preferred: record.already_preferred === true,
    name: record.name,
    ref: { id: ref.id },
    url: record.url,
    ...(typeof record.description === "string"
      ? { description: record.description }
      : {}),
    ...(typeof record.version === "string" ? { version: record.version } : {}),
  };
}

export function parseSkillsFindOutput(
  output: unknown
): SkillsFindOutput | null {
  const raw = asRecord(output);
  if (!raw) {
    return null;
  }
  const provider = asRecord(raw.provider);
  const attach = asRecord(raw.attach);
  if (
    raw.ok !== true ||
    typeof raw.query !== "string" ||
    !Array.isArray(raw.results) ||
    typeof provider?.id !== "string" ||
    typeof provider.label !== "string" ||
    !attach
  ) {
    return null;
  }
  const spaceRaw = asRecord(attach.space);
  const agentRaw = asRecord(attach.agent);
  const results: SkillsFindHit[] = [];
  for (const entry of raw.results) {
    const hit = parseHit(entry);
    if (hit) {
      results.push(hit);
    }
  }
  return {
    attach: {
      agent:
        agentRaw && typeof agentRaw.id === "string"
          ? { can_prefer: agentRaw.can_prefer === true, id: agentRaw.id }
          : null,
      space:
        spaceRaw && typeof spaceRaw.id === "string"
          ? { id: spaceRaw.id }
          : null,
    },
    ok: true,
    provider: { id: provider.id, label: provider.label },
    query: raw.query,
    results,
  };
}

export function matchesSkillsFindOutput(ctx: {
  output?: unknown;
  resolvedToolName?: string;
  toolName: string;
}): boolean {
  const name = ctx.resolvedToolName || ctx.toolName;
  return name === "skills_find" && parseSkillsFindOutput(ctx.output) !== null;
}
