// Expands a declarative `AgentConfig.workspace` (from @engenty/ai-core) into a
// concrete, tenant-scoped Mastra mount table.
//
// Two archetype presets:
//   assistant — per-user personal desk (engenty.copilot): `/home` user-scoped
//               (rw), `/space` (rw), `/company` (ro), `/skills` (ro), `/task`
//               when bound.
//   code_execution — sandbox-first: `/space` (rw), `/company` (ro), `/skills`
//                    (ro), `/sandbox` (rw), optional `/task` when bound.
//
// `/company` is the company as every Space sees it, read-only: `files/` is the
// company drive (the tenant-level commons, which was the writable `/shared`)
// and `spaces/<key>/` each publishing Space's `public/` folder. Nothing in a
// run writes it; the drive is published to through `company_files_publish`
// and a Space's folder through `/space/public`. There is no read-only `/`
// tenant asset mount; the seeded AGENTS.md/SOUL.md reach the agent via prompt
// injection (the instruction registry), not a filesystem mount.
//
// `scope` resolves to a CONTAINER-relative file-storage prefix (no
// `tenants/<tid>/` and no `spaces/<sid>/` — the FileStorageFilesystem adds the
// root). Which root a mount gets is `resolveMountSpaceId`'s job: work
// containers and the space commons hang off the space, skills and the personal
// home stay tenant-level. PLAN-spaces.md §1b.

import type {
  AgentWorkspaceConfig,
  AgentWorkspaceMount,
} from "@engenty/ai-core";
import {
  COMMONS_STORAGE_PREFIX,
  SPACE_PUBLIC_FOLDER,
  SPACE_PUBLIC_STORAGE_PREFIX,
  workWorkspaceRelativePrefix,
} from "@engenty/file-storage";

import { listCompanyApps } from "./company-apps.js";
import type { EngentyWorkspaceMountSpec } from "./contracts.js";

// Writable tenant-shared working context (cross-user/session). When a
// sandbox is enabled this prefix is staged locally and bind-mounted into the
// sandbox so running code can read/write it (see loader + docker provider).
// Re-exported from @engenty/file-storage so bytes stay where they are.
export { COMMONS_STORAGE_PREFIX } from "@engenty/file-storage";

// Agent/user-scoped personal working context. Shares the staged+bind-mounted+synced
// mechanism as commons when a sandbox is enabled (its storage prefix is per-user
// or per-agent — see `resolveScopeRelativePath`).
export const HOME_MOUNT_PATH = "/home";

export interface WorkspaceScopeContext {
  agentId: string;
  /**
   * The spaces whose `public/` folder the company reads, from the run's space
   * surface. Each becomes `/company/spaces/<key>/`, read-only. Absent (no
   * space resolved) leaves `/company/files` alone.
   */
  companySpaces?: readonly { id: string; key: string }[];
  /** Containment chain around the bound task (resolveWorkVisibility). */
  projectId?: string;
  /**
   * The standing routine whose fire this run is, when it is one. Successive
   * fires share the folder, which is what makes a routine able to keep notes
   * between runs at all.
   */
  routineId?: string;
  runId?: string;
  sandboxLifecycle?: "run" | "session" | "task" | "space";
  /**
   * The space this run happens in, from `resolveWorkVisibility`. Roots the work
   * containers and the space commons. Present for nearly every run once a
   * tenant has a default space — on its own it does NOT narrow anything.
   */
  spaceId?: string;
  taskIdentifier?: string;
  tenantId: string;
  threadId?: string;
  userId: string;
}

/** Mount point for a space's own shared folder. */
export const SPACE_MOUNT_PATH = "/space";

/**
 * The part of `/space` the rest of the company reads. Not a mount of its own —
 * Mastra refuses nested mounts — but a folder inside `/space` that the
 * sandbox binds read-only and file tools write only with approval.
 */
export const SPACE_PUBLIC_MOUNT_PATH = `${SPACE_MOUNT_PATH}/${SPACE_PUBLIC_FOLDER}`;

/** The company, as every Space sees it. Read-only in every run. */
export const COMPANY_MOUNT_PATH = "/company";
/** The company drive: the tenant-level commons (was `/shared`). */
export const COMPANY_FILES_MOUNT_PATH = `${COMPANY_MOUNT_PATH}/files`;
/** Parent of each publishing Space's `public/` folder, by Space key. */
export const COMPANY_SPACES_MOUNT_PATH = `${COMPANY_MOUNT_PATH}/spaces`;
/** Parent of the source of every App a publishing Space owns, by slug. */
export const COMPANY_APPS_MOUNT_PATH = `${COMPANY_MOUNT_PATH}/apps`;

const COMPANY_FILES_MOUNT: AgentWorkspaceMount = {
  access: "ro",
  path: COMPANY_FILES_MOUNT_PATH,
  scope: "tenant",
  source: "commons",
};

// A Space key as it may appear in a path: the URL slug rule. A key outside it
// is left out of `/company/spaces` rather than escaped into something odd.
const SPACE_KEY_PATH_SEGMENT = /^[a-z0-9][a-z0-9-]{0,62}$/;

/**
 * The space's own commons, alongside the tenant's.
 *
 * Its `public/` folder is what the rest of the company reads as
 * `/company/spaces/<key>/`. Drops itself when the run has no space
 * (`resolveScopeRelativePath`).
 */
const SPACE_COMMONS_MOUNT: AgentWorkspaceMount = {
  access: "rw",
  path: SPACE_MOUNT_PATH,
  scope: "space",
  source: "commons",
};

/**
 * Mount point for the space's DATA TREE (PLAN-space-data.md D4).
 *
 * Not a folder of bytes: `/data` renders the mounted modules' records as files
 * and routes every read and write through those modules' own operations, with
 * the run's principal. An agent that greps `/data/Contacts` is calling
 * `contacts_list`; one that edits an offer member is calling `offers_update`
 * and raising its approval card.
 *
 * Present only where the run HAS a space, and the space's own mounts decide
 * what appears inside it — `agent_access: none` hides a module entirely.
 */
export const DATA_MOUNT_PATH = "/data";

/**
 * `rw` because the point of D4 is that a file write IS the module's write
 * operation, gate included. Read-only would have been the timid version: it
 * would leave agents editing records through tools and reading them through
 * files, which is exactly the two-representations split this design removes.
 */
const DATA_MOUNT: AgentWorkspaceMount = {
  access: "rw",
  path: DATA_MOUNT_PATH,
  scope: "space",
  source: "data",
};

// Containment tiers around a bound task — the cascade (routine, then project)
// from the run's visibility chain (work-scope/resolve-work-visibility).
// rw for the whole chain (decision 2026-08-04): a task run writes its project
// workspace, not just its own. Unresolved binding → dropped.
const CONTAINMENT_MOUNTS: AgentWorkspaceMount[] = [
  {
    access: "rw",
    path: "/routine",
    requireBinding: true,
    scope: "routine",
    source: "routine",
  },
  {
    access: "rw",
    path: "/project",
    requireBinding: true,
    scope: "project",
    source: "project",
  },
];

// Preset mount tables. Order matters for skill discovery readability only.
const ASSISTANT_MOUNTS: AgentWorkspaceMount[] = [
  { access: "rw", path: HOME_MOUNT_PATH, scope: "user", source: "home" },
  COMPANY_FILES_MOUNT,
  SPACE_COMMONS_MOUNT,
  { access: "ro", path: "/skills", scope: "tenant", source: "skills" },
  {
    access: "rw",
    path: "/task",
    requireBinding: true,
    scope: "task",
    source: "checkout",
  },
  ...CONTAINMENT_MOUNTS,
  DATA_MOUNT,
];

const STAFF_MOUNTS: AgentWorkspaceMount[] = [
  // Staff agents are company resources: `/home` is agent-scoped scratch.
  { access: "rw", path: HOME_MOUNT_PATH, scope: "agent", source: "home" },
  COMPANY_FILES_MOUNT,
  SPACE_COMMONS_MOUNT,
  { access: "ro", path: "/skills", scope: "tenant", source: "skills" },
  {
    access: "rw",
    path: "/task",
    requireBinding: true,
    scope: "task",
    source: "checkout",
  },
  ...CONTAINMENT_MOUNTS,
  DATA_MOUNT,
];

const CODE_EXECUTION_MOUNTS: AgentWorkspaceMount[] = [
  COMPANY_FILES_MOUNT,
  SPACE_COMMONS_MOUNT,
  { access: "ro", path: "/skills", scope: "tenant", source: "skills" },
  { access: "rw", path: "/sandbox", scope: "sandbox", source: "sandbox" },
  {
    access: "rw",
    path: "/task",
    requireBinding: true,
    scope: "task",
    source: "checkout",
  },
  ...CONTAINMENT_MOUNTS,
  DATA_MOUNT,
];

// Explicit `mounts` win; otherwise expand the named preset. `custom` with no
// mounts yields an empty table (caller decides what that means).
export function expandWorkspaceMounts(
  config: AgentWorkspaceConfig
): AgentWorkspaceMount[] {
  if (config.mounts && config.mounts.length > 0) {
    return config.mounts;
  }
  switch (config.preset) {
    case "assistant":
      return ASSISTANT_MOUNTS;
    case "staff":
      return STAFF_MOUNTS;
    case "code_execution":
      return CODE_EXECUTION_MOUNTS;
    default:
      return [];
  }
}

export interface SandboxLifecycleContext {
  /**
   * The agent this sandbox belongs to.
   *
   * A `session` sandbox is keyed by the PARENT thread so a sub-agent reuses one
   * container across several delegations in a conversation. Keyed by the thread
   * ALONE, that also made the copilot and its CLI sub-agent share one container
   * — and a container carries the HostConfig of whoever created it first, so
   * the CLI agent's `network: "egress"` silently became the copilot's `none`.
   * Two agents are two computers; the thread only says which conversation.
   */
  agentId: string;
  runId: string;
  taskIdentifier?: string;
  threadId: string;
}

/**
 * Sandbox scratch layout, CONTAINER-relative. The root (tenant vs space) is
 * `resolveMountSpaceId`'s call, and sandboxes are space-rooted when the run has
 * a space — see the decision recorded there. `task` lifecycle reuses the task
 * checkout prefix, which is space-rooted for the same reason.
 */
export function resolveSandboxStorageRelativePath(
  lifecycle: "run" | "session" | "task" | "space",
  ctx: SandboxLifecycleContext
): string {
  if (lifecycle === "space") {
    // The space computer's `/sandbox`. A label for the mount table only: the
    // machine's layout (`resolveSandboxStorageLayout`) puts it in the Space
    // drive's `sandbox/` and never syncs it, so nothing is stored here.
    return "ai/sandboxes/space/workspace/";
  }
  if (lifecycle === "task") {
    const identifier = ctx.taskIdentifier?.trim();
    if (!identifier) {
      throw new Error("sandbox_task_lifecycle_requires_task_binding");
    }
    return workWorkspaceRelativePrefix("task", identifier);
  }
  const sandboxId =
    lifecycle === "session"
      ? `session-${ctx.threadId}-${ctx.agentId}`
      : `run-${ctx.runId}`;
  return `ai/sandboxes/${sandboxId}/workspace/`;
}

// (source, scope) -> tenant-relative storage prefix. Single switch point so a
// future `group` scope is a one-line addition (see plan "Group readiness").
export function resolveScopeRelativePath(
  mount: AgentWorkspaceMount,
  ctx: WorkspaceScopeContext
): string | null {
  switch (mount.source) {
    case "sandbox": {
      if (!(ctx.runId && ctx.threadId)) {
        return null;
      }
      const lifecycle = ctx.sandboxLifecycle ?? "run";
      if (lifecycle === "task") {
        const identifier = ctx.taskIdentifier?.trim();
        if (!identifier) {
          return null;
        }
      }
      return resolveSandboxStorageRelativePath(lifecycle, {
        agentId: ctx.agentId,
        runId: ctx.runId,
        threadId: ctx.threadId,
        ...(ctx.taskIdentifier ? { taskIdentifier: ctx.taskIdentifier } : {}),
      });
    }
    case "data":
      // A LABEL, not a storage key. The data mount has no bytes at rest, so
      // there is no prefix to resolve — but the mount table's contract is
      // "unresolved means dropped", and a data mount without a space genuinely
      // must be dropped (there is no tree to show). Returning the marker keeps
      // both facts in one place.
      return ctx.spaceId?.trim() ? "space-data" : null;
    case "commons":
      // Writable shared working context (durable, cross-user/session). The
      // relative path is the same at both roots — `resolveMountSpaceId` decides
      // whether this is the TENANT commons or the SPACE's own.
      if (mount.scope === "space" && !ctx.spaceId?.trim()) {
        // A space mount without a space is not the tenant commons by default;
        // dropping it is the fail-closed answer.
        return null;
      }
      return COMMONS_STORAGE_PREFIX;
    case "skills":
      return "ai/skills/";
    case "home":
      if (mount.scope === "agent") {
        return `ai/workspace/agents/${ctx.agentId}/`;
      }
      // default: per-user home (cross-agent)
      return `ai/workspace/users/${ctx.userId}/`;
    case "checkout": {
      const identifier = ctx.taskIdentifier?.trim();
      if (!identifier) {
        return null;
      }
      return workWorkspaceRelativePrefix("task", identifier);
    }
    case "routine": {
      const routineId = ctx.routineId?.trim();
      return routineId
        ? workWorkspaceRelativePrefix("routine", routineId)
        : null;
    }
    case "project": {
      const projectId = ctx.projectId?.trim();
      return projectId
        ? workWorkspaceRelativePrefix("project", projectId)
        : null;
    }
    default:
      return null;
  }
}

/**
 * The space a mount is rooted in, or `null` for tenant-level mounts.
 *
 * The split is the containment rule, not a preference: anything that is part of
 * the WORK (the space commons, the task checkout, the project folder,
 * and the run's sandbox scratch) lives inside the space, so a space-scoped
 * engenty cannot address another space's bytes — no path exists. Skills and the
 * personal/agent `/home` stay tenant-level: skills are a tenant library
 * (PLAN-spaces.md §1b) and a person's desk follows them across spaces.
 *
 * Sandbox scratch is space-rooted DELIBERATELY (Phase 2 checklist asked for a
 * decision): a sandbox holds whatever the run pulled out of its space, so
 * leaving it at the tenant root would be a hole in exactly the boundary this
 * plan exists to create. A run with no space keeps the tenant root.
 */
export function resolveMountSpaceId(
  mount: AgentWorkspaceMount,
  ctx: WorkspaceScopeContext
): string | null {
  const spaceId = ctx.spaceId?.trim();
  if (!spaceId) {
    return null;
  }
  switch (mount.source) {
    case "checkout":
    case "data":
    case "project":
    case "routine":
    case "sandbox":
      return spaceId;
    case "commons":
      return mount.scope === "space" ? spaceId : null;
    default:
      // `skills` and `home` are tenant-level by design.
      return null;
  }
}

/** Why a declared mount is not in this run's workspace. */
export type DroppedWorkspaceMountReason =
  /** The mount is rooted in the Space and the run has none (unresolved, or global). */
  | "no_space"
  /** `/task` (or a task-lifecycle sandbox) with no task bound to the run. */
  | "no_task"
  /** `/project` with no containment chain above the bound task. */
  | "no_project"
  /** `/routine` outside a routine fire. */
  | "no_routine"
  /** A scope the resolver does not know. */
  | "unsupported";

export interface DroppedWorkspaceMount {
  path: string;
  reason: DroppedWorkspaceMountReason;
}

function droppedMountReason(
  mount: AgentWorkspaceMount
): DroppedWorkspaceMountReason {
  switch (mount.source) {
    case "data":
    case "commons":
      return "no_space";
    case "checkout":
      return "no_task";
    case "sandbox":
      return "no_task";
    case "project":
      return "no_project";
    case "routine":
      return "no_routine";
    default:
      return "unsupported";
  }
}

/**
 * Resolve the declared mount table into Mastra mount specs for the current
 * run, AND say which declared mounts did not make it and why. Mounts whose
 * `requireBinding` entity is missing (e.g. `/task` with no task) or whose
 * Space is unresolved are dropped rather than mounted empty — fail-closed is
 * right, but a dropped `/data` or `/skills` used to be indistinguishable from
 * "this Space has no files, no skills". Callers log each drop and tell the
 * model in its runtime block.
 */
export function resolveEngentyMountSpecs(
  mounts: AgentWorkspaceMount[],
  ctx: WorkspaceScopeContext
): { dropped: DroppedWorkspaceMount[]; specs: EngentyWorkspaceMountSpec[] } {
  const specs: EngentyWorkspaceMountSpec[] = [];
  const dropped: DroppedWorkspaceMount[] = [];
  for (const mount of mounts) {
    const fileStorageRelativePath = resolveScopeRelativePath(mount, ctx);
    if (!fileStorageRelativePath) {
      dropped.push({ path: mount.path, reason: droppedMountReason(mount) });
      continue;
    }
    const spaceId = resolveMountSpaceId(mount, ctx);
    specs.push({
      fileStorageRelativePath,
      mountPath: mount.path,
      readOnly: mount.access === "ro",
      ...(mount.source === "data" ? { kind: "data" as const } : {}),
      ...(spaceId ? { spaceId } : {}),
    });
  }
  if (specs.some((spec) => spec.mountPath === COMPANY_FILES_MOUNT_PATH)) {
    const spaces = ctx.companySpaces ?? [];
    specs.push(...companySpaceMountSpecs(spaces));
    specs.push(
      ...listCompanyApps(ctx.tenantId, spaces).map((app) => ({
        fileStorageRelativePath: "app-source",
        localPath: app.srcPath,
        mountPath: `${COMPANY_APPS_MOUNT_PATH}/${app.slug}`,
        readOnly: true,
        spaceId: app.spaceId,
      }))
    );
  }
  return { dropped, specs };
}

/**
 * `/company/spaces/<key>/` for every publishing Space: that Space's `public/`
 * folder, read-only. They come with `/company/files` — an agent that has the
 * company view has all of it.
 */
export function companySpaceMountSpecs(
  spaces: readonly { id: string; key: string }[]
): EngentyWorkspaceMountSpec[] {
  const seen = new Set<string>();
  const specs: EngentyWorkspaceMountSpec[] = [];
  for (const space of spaces) {
    const key = space.key.trim().toLowerCase();
    if (
      !(SPACE_KEY_PATH_SEGMENT.test(key) && space.id.trim()) ||
      seen.has(key)
    ) {
      continue;
    }
    seen.add(key);
    specs.push({
      fileStorageRelativePath: SPACE_PUBLIC_STORAGE_PREFIX,
      mountPath: `${COMPANY_SPACES_MOUNT_PATH}/${key}`,
      readOnly: true,
      spaceId: space.id.trim(),
    });
  }
  return specs;
}

/** Whether a mount is part of the read-only `/company` view. */
export function isCompanyMountPath(mountPath: string): boolean {
  return (
    mountPath === COMPANY_MOUNT_PATH ||
    mountPath.startsWith(`${COMPANY_MOUNT_PATH}/`)
  );
}

// The specs alone — for callers that have no one to tell about drops.
export function buildEngentyMountSpecs(
  mounts: AgentWorkspaceMount[],
  ctx: WorkspaceScopeContext
): EngentyWorkspaceMountSpec[] {
  return resolveEngentyMountSpecs(mounts, ctx).specs;
}

// The default skill discovery paths inside the workspace. The `/skills` mount
// maps to `ai/skills/` in file storage and splits into two tiers: `managed`
// (read-only, code-provided) and `custom` (editable, uploaded/installed). Both
// are discovered so agents see every available skill.
export const DEFAULT_SKILL_DISCOVERY_PATHS = [
  "/skills/managed",
  "/skills/custom",
];
