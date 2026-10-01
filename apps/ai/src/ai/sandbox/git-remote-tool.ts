// `git_remote`: clone, fetch and push a repository whose remote needs a
// person's token, without the agent ever seeing the token.
//
// Local git (commit, branch, diff, merge) stays the agent's own, in the
// sandbox. Only the network step runs on the host (git-host.ts), with the
// token a person entered on a `secret_request` card (secret-requests.ts). A
// public remote needs no card: the first attempt is anonymous, and the card
// appears only when the remote answers with an auth failure.

import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";

import { createRequestDecisionArtifact } from "@engenty/ai-core";
import { createTool } from "@mastra/core/tools";
import type { MastraSandbox, Workspace } from "@mastra/core/workspace";
import { z } from "zod";

import {
  acquireFrontendToolSuspendSlot,
  releaseFrontendToolSuspendSlot,
} from "../../../ai/frontend-tools/frontend-tool-suspend-lock.js";
import { getEngentyToolsRunContext } from "../../../ai/tools/engenty-tools/lib/run-context.js";
import { requestDecisionResumeSchema } from "../../../ai/tools/request-decision/native-request-decision.js";
import {
  GIT_REMOTE_TOOL_ID,
  isGranted,
} from "../workspace/workspace-tool-guards.js";
import { runningContainerId } from "./engenty-cli-relay.js";
import {
  type GitCredential,
  type GitRemote,
  type GitResult,
  gitMirrorDir,
  hostScratchDir,
  isGitAuthFailure,
  PUSH_BUNDLE_LIMIT_BYTES,
  parseGitRemote,
  pipeIntoContainer,
  pipeOutOfContainer,
  runHostGit,
  syncGitMirror,
  withMirrorLock,
} from "./git-host.js";
import {
  closeSecretRequest,
  forgetSecret,
  lookupSecret,
  openSecretRequest,
  type SecretScope,
} from "./secret-requests.js";

export { GIT_REMOTE_TOOL_ID } from "../workspace/workspace-tool-guards.js";
export const SECRET_ENTERED_CHOICE_ID = "secret_request_entered";
const DECLINE_CHOICE_ID = "secret_request_decline";
const SANDBOX_TIMEOUT_MS = 5 * 60 * 1000;
/** GitHub takes any username with a token; GitLab and Bitbucket want theirs. */
const DEFAULT_USERNAME = "x-access-token";

const BRANCH_RE = /^(?!-)(?!.*\.\.)(?!.*\/\/)[A-Za-z0-9._/-]{1,200}$/;

type Outcome =
  | { kind: "auth" }
  | { kind: "done"; message: string }
  | { kind: "failed"; message: string };

function shq(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function isBranch(value: string): boolean {
  return (
    BRANCH_RE.test(value) && !value.endsWith(".lock") && !value.endsWith("/")
  );
}

async function inSandbox(
  sandbox: MastraSandbox,
  script: string
): Promise<{ code: number; output: string }> {
  const result = await sandbox.executeCommand?.(script, [], {
    timeout: SANDBOX_TIMEOUT_MS,
  });
  return {
    code: result?.exitCode ?? 1,
    output: `${result?.stdout ?? ""}${result?.stderr ?? ""}`.trim(),
  };
}

async function containerOf(sandbox: MastraSandbox): Promise<string> {
  // A command wakes a sleeping space computer before we look it up.
  await inSandbox(sandbox, "true");
  const id = await runningContainerId(sandbox.id);
  if (!id) {
    throw new Error("sandbox container not running");
  }
  return id;
}

function failed(step: string, result: GitResult | { output: string }) {
  return {
    kind: "failed" as const,
    message: `${step} failed:\n${result.output || "(no output)"}`,
  };
}

async function syncMirror(input: {
  credential?: GitCredential;
  dir: string;
  remote: GitRemote;
}): Promise<Outcome | null> {
  const result = await withMirrorLock(input.dir, () =>
    syncGitMirror(input.dir, input.remote, input.credential)
  );
  if (isGitAuthFailure(result)) {
    return { kind: "auth" };
  }
  return result.code === 0 ? null : failed("Reaching the remote", result);
}

/** Bundle the mirror and hand it to the sandbox at a fresh path. */
async function deliverMirror(
  sandbox: MastraSandbox,
  dir: string
): Promise<{ containerPath: string } | Outcome> {
  const scratch = hostScratchDir();
  const hostFile = `${scratch}/mirror.bundle`;
  try {
    const bundled = await withMirrorLock(dir, () =>
      runHostGit(
        ["-C", dir, "bundle", "create", "--quiet", hostFile, "--all"],
        {
          allowProtocol: "file",
        }
      )
    );
    if (bundled.code !== 0) {
      return /empty bundle/i.test(bundled.output)
        ? { kind: "failed", message: "The remote repository is empty." }
        : failed("Packing the repository", bundled);
    }
    const containerPath = `/tmp/engenty-git/${randomUUID()}.bundle`;
    await pipeIntoContainer({
      containerId: await containerOf(sandbox),
      containerPath,
      hostFile,
    });
    return { containerPath };
  } finally {
    rmSync(scratch, { force: true, recursive: true });
  }
}

async function cloneRepo(input: {
  credential?: GitCredential;
  dest: string;
  dir: string;
  remote: GitRemote;
  sandbox: MastraSandbox;
}): Promise<Outcome> {
  const exists = await inSandbox(input.sandbox, `test -e ${shq(input.dest)}`);
  if (exists.code === 0) {
    return {
      kind: "failed",
      message: `${input.dest} already exists. Use action "fetch" in it, or clone into a new folder.`,
    };
  }
  const synced = await syncMirror(input);
  if (synced) {
    return synced;
  }
  const delivered = await deliverMirror(input.sandbox, input.dir);
  if ("kind" in delivered) {
    return delivered;
  }
  const bundle = shq(delivered.containerPath);
  const dest = shq(input.dest);
  const cloned = await inSandbox(
    input.sandbox,
    `git clone --quiet ${bundle} ${dest} && git -C ${dest} remote set-url origin ${shq(input.remote.url)}; rc=$?; rm -f ${bundle}; exit $rc`
  );
  return cloned.code === 0
    ? {
        kind: "done",
        message: `Cloned ${input.remote.url} into ${input.dest}. Work in it with plain git; use git_remote again to fetch or push.`,
      }
    : failed("Cloning", cloned);
}

async function fetchRepo(input: {
  credential?: GitCredential;
  dir: string;
  remote: GitRemote;
  repo: string;
  sandbox: MastraSandbox;
}): Promise<Outcome> {
  const synced = await syncMirror(input);
  if (synced) {
    return synced;
  }
  const delivered = await deliverMirror(input.sandbox, input.dir);
  if ("kind" in delivered) {
    return delivered;
  }
  const bundle = shq(delivered.containerPath);
  const fetched = await inSandbox(
    input.sandbox,
    `cd ${shq(input.repo)} && git fetch --quiet --prune ${bundle} '+refs/heads/*:refs/remotes/origin/*' '+refs/tags/*:refs/tags/*'; rc=$?; rm -f ${bundle}; exit $rc`
  );
  return fetched.code === 0
    ? {
        kind: "done",
        message: `Fetched ${input.remote.url}. The remote branches are under origin/ — merge or rebase with plain git.`,
      }
    : failed("Fetching", fetched);
}

async function pushRepo(input: {
  branch: string;
  credential?: GitCredential;
  dir: string;
  remote: GitRemote;
  remoteBranch: string;
  repo: string;
  sandbox: MastraSandbox;
}): Promise<Outcome> {
  // Without a token a push can only fail; ask before packing anything.
  if (!input.credential) {
    return { kind: "auth" };
  }
  const synced = await syncMirror(input);
  if (synced) {
    return synced;
  }
  const containerPath = `/tmp/engenty-git/${randomUUID()}.bundle`;
  const packed = await inSandbox(
    input.sandbox,
    `cd ${shq(input.repo)} && mkdir -p /tmp/engenty-git && git bundle create --quiet ${shq(containerPath)} ${shq(`refs/heads/${input.branch}`)} --not --remotes=origin`
  );
  if (packed.code !== 0) {
    return /empty bundle/i.test(packed.output)
      ? {
          kind: "done",
          message: `Nothing to push: ${input.branch} has no commits the remote does not have.`,
        }
      : failed("Packing the branch", packed);
  }
  const scratch = hostScratchDir();
  const hostFile = `${scratch}/push.bundle`;
  const tempRef = `refs/engenty-push/${randomUUID()}`;
  try {
    await pipeOutOfContainer({
      containerId: await containerOf(input.sandbox),
      containerPath,
      hostFile,
      maxBytes: PUSH_BUNDLE_LIMIT_BYTES,
    });
    await inSandbox(input.sandbox, `rm -f ${shq(containerPath)}`);
    const pushed = await withMirrorLock(input.dir, async () => {
      const verified = await runHostGit(
        ["-C", input.dir, "bundle", "verify", "--quiet", hostFile],
        { allowProtocol: "file" }
      );
      if (verified.code !== 0) {
        return { result: verified, sha: "", step: "Checking the branch" };
      }
      const loaded = await runHostGit(
        [
          "-C",
          input.dir,
          "-c",
          "transfer.fsckObjects=true",
          "fetch",
          "--quiet",
          "--no-tags",
          hostFile,
          `refs/heads/${input.branch}:${tempRef}`,
        ],
        { allowProtocol: "file" }
      );
      if (loaded.code !== 0) {
        return { result: loaded, sha: "", step: "Loading the branch" };
      }
      const sha = await runHostGit(["-C", input.dir, "rev-parse", tempRef], {
        allowProtocol: "file",
      });
      const result = await runHostGit(
        [
          "-C",
          input.dir,
          "push",
          "--porcelain",
          input.remote.url,
          `${tempRef}:refs/heads/${input.remoteBranch}`,
        ],
        { allowProtocol: "https", credential: input.credential }
      );
      await runHostGit(["-C", input.dir, "update-ref", "-d", tempRef], {
        allowProtocol: "file",
      });
      return { result, sha: sha.output.trim(), step: "Pushing" };
    });
    if (isGitAuthFailure(pushed.result)) {
      return { kind: "auth" };
    }
    if (pushed.result.code !== 0) {
      return failed(pushed.step, pushed.result);
    }
    if (/^[0-9a-f]{40,64}$/.test(pushed.sha)) {
      await inSandbox(
        input.sandbox,
        `cd ${shq(input.repo)} && git update-ref ${shq(`refs/remotes/origin/${input.remoteBranch}`)} ${pushed.sha}`
      );
    }
    return {
      kind: "done",
      message: `Pushed ${input.branch} to ${input.remoteBranch} on ${input.remote.url}.`,
    };
  } finally {
    rmSync(scratch, { force: true, recursive: true });
  }
}

const DESCRIPTION =
  "Clone, fetch or push a git repository over https — the way to reach a PRIVATE remote. If the remote needs a login, the person is asked for a token on a card; it is used on the host and you never see it. Never ask for a token or password in chat, and do not put one in a URL or a command. Use plain git in the sandbox for everything local (commit, branch, merge, diff). A push asks the person first.";

const inputSchema = z.object({
  action: z.enum(["clone", "fetch", "push"]),
  branch: z
    .string()
    .max(200)
    .optional()
    .describe("push: the local branch to push."),
  path: z
    .string()
    .min(1)
    .max(400)
    .describe(
      "clone: the new folder to clone into, e.g. /sandbox/site. fetch/push: the repository's folder."
    ),
  reason: z
    .string()
    .min(1)
    .max(300)
    .describe(
      "Why you need the repository, one sentence — shown to the person if a token is needed."
    ),
  remote_branch: z
    .string()
    .max(200)
    .optional()
    .describe("push: the branch on the remote; defaults to `branch`."),
  url: z
    .string()
    .max(500)
    .optional()
    .describe("clone: the repository's https URL, without credentials."),
});

type GitRemoteInput = z.infer<typeof inputSchema>;

/** The conversation a run answers in — also its suspend lock. */
function conversationKey(): string {
  const ctx = getEngentyToolsRunContext();
  return (
    ctx.orchestratorThreadId?.trim() ||
    ctx.userFacingThreadId?.trim() ||
    ctx.runId?.trim() ||
    "__untagged__"
  );
}

async function resolveRemote(
  sandbox: MastraSandbox,
  data: GitRemoteInput
): Promise<GitRemote | string> {
  if (data.action === "clone") {
    return (
      parseGitRemote(data.url ?? "") ??
      "`url` must be an https URL without a username, password or query."
    );
  }
  const origin = await inSandbox(
    sandbox,
    `git -C ${shq(data.path)} remote get-url origin`
  );
  if (origin.code !== 0) {
    return `${data.path} is not a git repository with an origin remote.`;
  }
  return (
    parseGitRemote(origin.output) ??
    `The origin of ${data.path} is not an https URL without credentials.`
  );
}

// The open card per conversation and remote, so the resume can close it.
const openRequests = new Map<string, string>();

export function createGitRemoteTool(input: {
  agentId: string;
  spaceId: string;
  tenantId: string;
  workspace: Workspace;
}) {
  return createTool({
    id: GIT_REMOTE_TOOL_ID,
    description: DESCRIPTION,
    inputSchema,
    requireApproval: (data: GitRemoteInput) =>
      data.action === "push" &&
      !isGranted(GIT_REMOTE_TOOL_ID, data as Record<string, unknown>),
    resumeSchema: requestDecisionResumeSchema,
    execute: async (data, ctx) => {
      const sandbox = input.workspace.sandbox as MastraSandbox | undefined;
      if (!sandbox?.executeCommand) {
        return { error: "no_sandbox", note: "This run has no computer." };
      }
      const branch = data.branch?.trim() ?? "";
      const remoteBranch = data.remote_branch?.trim() || branch;
      if (
        data.action === "push" &&
        !(isBranch(branch) && isBranch(remoteBranch))
      ) {
        return {
          error: "invalid_branch",
          note: "push needs `branch` (and optionally `remote_branch`) as plain branch names.",
        };
      }
      const remote = await resolveRemote(sandbox, data);
      if (typeof remote === "string") {
        return { error: "invalid_remote", note: remote };
      }
      const lockKey = conversationKey();
      const scope: SecretScope = {
        agentId: input.agentId,
        spaceId: input.spaceId,
        tenantId: input.tenantId,
        threadId: lockKey,
      };
      const key = `git:${remote.host}`;
      const requestKey = `${lockKey}\n${key}`;
      // Resumed from OUR card only — a push also resumes from its approval.
      const openRequestId = openRequests.get(requestKey);
      const resumed =
        ctx.agent?.resumeData !== undefined && openRequestId !== undefined;
      if (resumed) {
        releaseFrontendToolSuspendSlot(lockKey);
        closeSecretRequest(openRequestId);
        openRequests.delete(requestKey);
      }
      const values = lookupSecret(scope, key);
      if (resumed && !values) {
        return `The person did not enter a token for ${remote.host}. Do not ask for it in chat; continue without the repository or say what you need.` as never;
      }
      const credential = values?.password
        ? {
            password: values.password,
            username: values.username?.trim() || DEFAULT_USERNAME,
          }
        : undefined;
      const dir = gitMirrorDir({
        remote,
        spaceId: input.spaceId,
        tenantId: input.tenantId,
      });
      const common = {
        ...(credential ? { credential } : {}),
        dir,
        remote,
        sandbox,
      };
      let outcome: Outcome;
      try {
        outcome =
          data.action === "clone"
            ? await cloneRepo({ ...common, dest: data.path })
            : data.action === "fetch"
              ? await fetchRepo({ ...common, repo: data.path })
              : await pushRepo({
                  ...common,
                  branch,
                  remoteBranch,
                  repo: data.path,
                });
      } catch (error) {
        return {
          error: "git_remote_failed",
          note: error instanceof Error ? error.message : String(error),
        };
      }
      if (outcome.kind === "done") {
        return outcome.message as never;
      }
      if (outcome.kind === "failed") {
        return { error: "git_remote_failed", note: outcome.message };
      }
      if (credential) {
        forgetSecret(scope, key);
        if (resumed) {
          return `${remote.host} rejected the token the person entered. Tell them; do not ask for it in chat.` as never;
        }
      }
      if (!getEngentyToolsRunContext().canSuspendForInteraction) {
        return {
          note: `${remote.host} needs a login and nobody is at the keyboard for this run. Finish without it and report that the person needs to run this in a chat.`,
          status: "needs_user",
        } as never;
      }
      const requestId = openSecretRequest({
        fieldIds: ["username", "password"],
        key,
        scope,
      });
      openRequests.set(requestKey, requestId);
      const artifact = createRequestDecisionArtifact({
        choices: [
          {
            description: "Continue without it.",
            id: DECLINE_CHOICE_ID,
            label: "Not now",
          },
        ],
        title: data.reason,
      });
      const ticket = await acquireFrontendToolSuspendSlot(lockKey);
      try {
        await ctx.agent?.suspend({
          ...artifact,
          preview: {
            agent_id: input.agentId,
            fields: [
              { id: "username", kind: "username", label: "Username" },
              { id: "password", kind: "password", label: "Token" },
            ],
            filled_choice_id: SECRET_ENTERED_CHOICE_ID,
            kind: "secret_request",
            request_id: requestId,
            space_id: input.spaceId,
            target: remote.url,
          },
        });
        releaseFrontendToolSuspendSlot(lockKey, ticket);
      } catch (error) {
        releaseFrontendToolSuspendSlot(lockKey, ticket);
        throw error;
      }
      return undefined as never;
    },
  });
}

/** `git_remote` for a run with a computer in a Space; `{}` otherwise. */
export function createGitRemoteTools(input: {
  agentId: string;
  spaceId: string | undefined;
  tenantId: string;
  workspace: Workspace | undefined;
}): Record<string, ReturnType<typeof createGitRemoteTool>> {
  const { spaceId, workspace } = input;
  if (!(spaceId && workspace?.sandbox)) {
    return {};
  }
  return {
    [GIT_REMOTE_TOOL_ID]: createGitRemoteTool({
      agentId: input.agentId,
      spaceId,
      tenantId: input.tenantId,
      workspace,
    }),
  };
}
