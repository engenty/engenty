// Skills an installer left on a space computer, offered to the Space.
//
// `npx skills add`, Claude plugins and vendor CLIs write SKILL.md folders for
// the coding agents they target — `~/.agents/skills` is the skills CLI's
// canonical copy, and each of its ~70 agents gets its own folder
// (`~/.claude/skills`, `~/.config/opencode/skills`, `~/.gemini/antigravity/
// skills`, …), usually a link to that copy. A project install lands in the
// working dir instead (`/sandbox/.agents/skills`). Engenty reads skills only
// from `/skills`, so without this a bot installs skills its colleagues never
// see.
//
// No list of agent folders: any `skills/<name>/SKILL.md` a few levels below
// `$HOME` or `/sandbox` is a skill, so a new agent's folder needs no change
// here. Installing copies one into the tenant's custom tier like any registry
// skill, and the same card mounts it on the Space.

import { isValidAgentSkillName } from "@engenty/ai-core";
import {
  openSpaceComputerDrive,
  openSpaceComputerHome,
  SKIPPED_DIRS,
  segmentsOf,
  type UntrustedTree,
} from "../../sandbox/space-computer-home.js";
import { parseSkillMarkdown } from "../skill-frontmatter.js";
import type {
  FetchedSkill,
  FetchedSkillFile,
  SkillRef,
  SkillRegistryProvider,
  SkillSearchResult,
} from "./types.js";

export const COMPUTER_SKILL_PROVIDER_ID = "computer";

/** The trees a skill can be installed into, as the computer names them. */
const ROOTS = {
  home: { label: "~", open: openSpaceComputerHome },
  sandbox: { label: "/sandbox", open: openSpaceComputerDrive },
} as const;

type RootKey = keyof typeof ROOTS;

/** A folder named like this holds skill folders (`opencode` once used `skill`). */
const SKILL_FOLDER_NAMES = new Set(["skills", "skill"]);

/** Deep enough for `~/.config/kimchi/harness/skills/<name>`. */
const MAX_SEARCH_DEPTH = 5;
/** Dirs visited per tree before the search gives up on the rest. */
const MAX_SEARCH_DIRS = 4000;

const MAX_SKILL_MD_BYTES = 256 * 1024;
const MAX_SKILL_FILES = 200;
const MAX_SKILL_BYTES = 4 * 1024 * 1024;
const TEXT_EXTENSIONS =
  /\.(md|mdx|txt|json|ya?ml|toml|csv|tsv|html?|css|[cm]?[jt]sx?|py|sh|sql|xml|svg)$/i;

/** `<spaceId>/<root>/<path to the skill folder>`, the ref a card sends back. */
export function computerSkillRefId(input: {
  root: RootKey;
  skillDir: string;
  spaceId: string;
}): string {
  return `${input.spaceId}/${input.root}/${input.skillDir}`;
}

/** The Space and folder a computer ref points at, or null when it is not one. */
export function parseComputerSkillRef(
  refId: string
): { root: RootKey; skillDir: string; spaceId: string } | null {
  const [spaceId, root, ...rest] = refId.split("/");
  const skillDir = rest.join("/");
  if (!(spaceId && root && root in ROOTS && segmentsOf(skillDir)?.length)) {
    return null;
  }
  return { root: root as RootKey, skillDir, spaceId };
}

/**
 * Every `<skills folder>/<name>/SKILL.md` in the tree, breadth first so the
 * shallow (canonical) copies come before links deep in agent folders.
 */
async function findSkillDirs(tree: UntrustedTree): Promise<string[]> {
  const found: string[] = [];
  let queue: string[] = [""];
  let visited = 0;
  for (let depth = 0; depth <= MAX_SEARCH_DEPTH && queue.length > 0; depth++) {
    const next: string[] = [];
    for (const dir of queue) {
      for (const name of await tree.listDirs(dir)) {
        visited += 1;
        if (visited > MAX_SEARCH_DIRS) {
          return found;
        }
        if (SKIPPED_DIRS.has(name)) {
          continue;
        }
        const child = dir ? `${dir}/${name}` : name;
        if (SKILL_FOLDER_NAMES.has(name)) {
          for (const skill of await tree.listDirs(child)) {
            found.push(`${child}/${skill}`);
          }
        } else {
          next.push(child);
        }
      }
    }
    queue = next;
  }
  return found;
}

async function readSkillMarkdown(tree: UntrustedTree, skillDir: string) {
  const bytes = await tree.readFile(`${skillDir}/SKILL.md`, MAX_SKILL_MD_BYTES);
  if (!bytes) {
    return null;
  }
  const raw = bytes.toString("utf8");
  try {
    const parsed = parseSkillMarkdown(raw);
    const folder = skillDir.split("/").at(-1) ?? "";
    const name = parsed.frontmatter.name?.trim() || folder;
    return isValidAgentSkillName(name) ? { name, parsed, raw } : null;
  } catch {
    return null;
  }
}

export function createComputerSkillProvider(input: {
  spaceId: string;
  tenantId: string;
}): SkillRegistryProvider {
  const trees = {
    home: ROOTS.home.open(input),
    sandbox: ROOTS.sandbox.open(input),
  } satisfies Record<RootKey, UntrustedTree>;

  async function search(query: string): Promise<SkillSearchResult[]> {
    const needle = query.trim().toLowerCase();
    // One skill linked into many agent folders is one skill: by real folder,
    // then by name.
    const seenDirs = new Set<string>();
    const seenNames = new Set<string>();
    const results: SkillSearchResult[] = [];
    for (const root of Object.keys(ROOTS) as RootKey[]) {
      const tree = trees[root];
      for (const skillDir of await findSkillDirs(tree)) {
        const real = await tree.resolve(skillDir);
        if (!real || seenDirs.has(real)) {
          continue;
        }
        seenDirs.add(real);
        const skill = await readSkillMarkdown(tree, skillDir);
        if (!skill || seenNames.has(skill.name)) {
          continue;
        }
        const description = skill.parsed.frontmatter.description;
        const haystack = `${skill.name} ${description ?? ""}`.toLowerCase();
        if (needle && needle !== "*" && !haystack.includes(needle)) {
          continue;
        }
        seenNames.add(skill.name);
        const folder = skillDir.split("/").slice(0, -1).join("/");
        results.push({
          name: skill.name,
          ref: {
            id: computerSkillRefId({ root, skillDir, spaceId: input.spaceId }),
          },
          tags: [`${ROOTS[root].label}/${folder}`],
          ...(description ? { description } : {}),
        });
      }
    }
    return results;
  }

  async function fetchSkill(ref: SkillRef): Promise<FetchedSkill> {
    const parsedRef = parseComputerSkillRef(ref.id);
    if (!parsedRef || parsedRef.spaceId !== input.spaceId) {
      throw new Error("Not a skill on this Space's computer.");
    }
    const tree = trees[parsedRef.root];
    const { skillDir } = parsedRef;
    const skill = await readSkillMarkdown(tree, skillDir);
    if (!skill) {
      throw new Error(`No SKILL.md in ${skillDir} on this computer.`);
    }
    const files: FetchedSkillFile[] = [];
    let total = 0;
    const paths = await tree.listFiles(skillDir, {
      maxDepth: 4,
      maxFiles: MAX_SKILL_FILES,
    });
    for (const rel of paths) {
      if (rel === "SKILL.md") {
        continue;
      }
      const bytes = await tree.readFile(
        `${skillDir}/${rel}`,
        MAX_SKILL_BYTES - total
      );
      if (!bytes) {
        continue;
      }
      total += bytes.byteLength;
      files.push(
        TEXT_EXTENSIONS.test(rel)
          ? { path: rel, text: bytes.toString("utf8") }
          : { contentBase64: bytes.toString("base64"), path: rel }
      );
    }
    return { files, name: skill.name, skillMarkdown: skill.raw };
  }

  return {
    // A folder on a machine has no page to link to.
    browseUrl: () => "",
    fetchSkill,
    id: COMPUTER_SKILL_PROVIDER_ID,
    label: "This Space's computer",
    search,
  };
}
