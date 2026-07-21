// Agent-proposed skills (memory Phase 4b). Proposals live under
//   tenants/<tid>/ai/skills/proposed/<name>/SKILL.md
// — a sibling of the managed/custom tiers that skill discovery deliberately
// does NOT walk (DEFAULT_SKILL_DISCOVERY_PATHS lists /skills/managed and
// /skills/custom only). A proposal becomes a live skill only when a human
// approves it, which copies it into the custom tier and removes the proposal;
// rejecting just removes it. The managed tier stays untouchable throughout.

import { fileStorageTenantObjectKey } from "@engenty/file-storage";
import {
  parseSkillMarkdown,
  serializeSkillMarkdown,
  type SkillFrontmatter,
} from "./skill-frontmatter.js";

export const SKILL_PROPOSAL_SOURCE = "agent-proposal";
const PROPOSED_DIR = "proposed";
const SKILL_MD = "SKILL.md";

const decoder = new TextDecoder();
const encoder = new TextEncoder();

interface ProposalStorageClient {
  delete(key: string): Promise<void>;
  download(key: string): Promise<Uint8Array | null>;
  list(
    prefix: string,
    options?: { limit?: number; recursive?: boolean }
  ): Promise<{ key: string }[]>;
  upload(
    key: string,
    bytes: Uint8Array,
    options?: { contentType?: string; upsert?: boolean }
  ): Promise<void>;
}

export interface SkillProposalSummary {
  description: string;
  name: string;
  proposed_by: string | null;
}

export interface SkillProposalDetail extends SkillProposalSummary {
  body: string;
  frontmatter: SkillFrontmatter;
}

function proposalPrefix(tenantId: string): string {
  return `${fileStorageTenantObjectKey(tenantId, "ai", "skills", PROPOSED_DIR)}/`;
}

export function skillProposalKey(
  tenantId: string,
  name: string,
  relativePath: string = SKILL_MD
): string {
  const segments = relativePath.split("/").filter(Boolean);
  return fileStorageTenantObjectKey(
    tenantId,
    "ai",
    "skills",
    PROPOSED_DIR,
    name,
    ...segments
  );
}

export function createSkillProposalStore(options: {
  storage: ProposalStorageClient;
  tenantId: string;
}) {
  const { storage, tenantId } = options;

  async function get(name: string): Promise<SkillProposalDetail | null> {
    const bytes = await storage.download(skillProposalKey(tenantId, name));
    if (!bytes) {
      return null;
    }
    const { body, frontmatter } = parseSkillMarkdown(decoder.decode(bytes));
    return {
      body,
      description: frontmatter.description ?? "",
      frontmatter,
      name,
      proposed_by: frontmatter.engenty?.originRef ?? null,
    };
  }

  return {
    get,

    async list(): Promise<SkillProposalSummary[]> {
      const prefix = proposalPrefix(tenantId);
      const files = await storage.list(prefix, { recursive: true });
      const names = new Set<string>();
      for (const file of files) {
        if (!file.key.startsWith(prefix)) {
          continue;
        }
        const [folder, ...tail] = file.key.slice(prefix.length).split("/");
        if (folder && tail.length === 1 && tail[0] === SKILL_MD) {
          names.add(folder);
        }
      }
      const summaries: SkillProposalSummary[] = [];
      for (const name of [...names].sort()) {
        const detail = await get(name);
        if (detail) {
          summaries.push({
            description: detail.description,
            name: detail.name,
            proposed_by: detail.proposed_by,
          });
        }
      }
      return summaries;
    },

    async put(input: {
      body: string;
      description: string;
      name: string;
      proposedBy: string | null;
    }): Promise<SkillProposalSummary> {
      const frontmatter: SkillFrontmatter = {
        description: input.description,
        engenty: {
          source: SKILL_PROPOSAL_SOURCE,
          ...(input.proposedBy ? { originRef: input.proposedBy } : {}),
        },
        name: input.name,
      };
      const markdown = serializeSkillMarkdown(frontmatter, input.body);
      await storage.upload(
        skillProposalKey(tenantId, input.name),
        encoder.encode(markdown),
        { contentType: "text/markdown", upsert: true }
      );
      return {
        description: input.description,
        name: input.name,
        proposed_by: input.proposedBy,
      };
    },

    async remove(name: string): Promise<void> {
      const prefix = `${proposalPrefix(tenantId)}${name}/`;
      const files = await storage.list(prefix, { recursive: true });
      for (const file of files) {
        if (file.key.startsWith(prefix)) {
          await storage.delete(file.key);
        }
      }
    },
  };
}

export type SkillProposalStore = ReturnType<typeof createSkillProposalStore>;
