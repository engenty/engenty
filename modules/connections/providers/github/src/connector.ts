import {
  type ConnectorAction,
  type ConnectorActionContext,
  defineConnector,
} from "@engenty/connections-sdk";
import { z } from "zod";

/**
 * The GitHub connector exposes the repository + pull-request surface the hosted
 * coder needs. Deliberately NARROW in v1:
 *
 * - read actions (`repos_list`, `repo_get`, `pr_get`) are auto-allowed and,
 *   because they are low-risk, are reachable from Code Mode's read-only execute.
 * - `pr_create` is the sole `write` action (approval-gated by the connections
 *   policy) — the human sign-off on delivering a coder's work as a PR.
 *
 * The clone/push CREDENTIAL is intentionally NOT a connector action: read
 * actions are reachable from Code Mode (any low-risk catalog op can be invoked
 * there), so returning a raw token as an action output would leak it into an
 * agent-visible surface. The coder's repo checkout obtains its token through a
 * dedicated, non-gateway core route instead (see PLAN-engenty-coder Phase 2).
 *
 * The single `repo` OAuth scope is requested up front (via `baseScopes`) so
 * enabling `pr_create` later never forces a re-consent.
 */

const GITHUB_API_BASE = "https://api.github.com";
const GITHUB_API_VERSION = "2022-11-28";

/** GitHub returns application-level failures as non-2xx with a JSON `message`. */
async function githubApi<T>(
  ctx: ConnectorActionContext,
  path: string,
  init?: { method?: string; body?: unknown }
): Promise<T> {
  const response = await ctx.fetchImpl(`${GITHUB_API_BASE}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${ctx.accessToken}`,
      "x-github-api-version": GITHUB_API_VERSION,
      ...(init?.body === undefined
        ? {}
        : { "content-type": "application/json" }),
    },
    ...(init?.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
  if (!response.ok) {
    let message = `${response.status}`;
    try {
      const data = (await response.json()) as { message?: string };
      if (data.message) {
        message = `${data.message} (${response.status})`;
      }
    } catch {
      // Non-JSON error body; fall back to the status code.
    }
    throw new Error(`github_api_error: ${message}`);
  }
  return (await response.json()) as T;
}

interface GitHubRepo {
  default_branch?: string;
  description?: string | null;
  full_name?: string;
  html_url?: string;
  private?: boolean;
}

interface GitHubPull {
  base?: { ref?: string };
  head?: { ref?: string };
  html_url?: string;
  merged?: boolean;
  number?: number;
  state?: string;
  title?: string;
}

function mapRepo(repo: GitHubRepo) {
  return {
    default_branch: repo.default_branch ?? "",
    description: repo.description ?? null,
    full_name: repo.full_name ?? "",
    html_url: repo.html_url ?? "",
    private: repo.private ?? false,
  };
}

function mapPull(pull: GitHubPull) {
  return {
    base: pull.base?.ref ?? "",
    head: pull.head?.ref ?? "",
    html_url: pull.html_url ?? "",
    merged: pull.merged ?? false,
    number: pull.number ?? 0,
    state: pull.state ?? "",
    title: pull.title ?? "",
  };
}

const repoFullName = z
  .string()
  .regex(/^[^/\s]+\/[^/\s]+$/, "Expected 'owner/repo'.")
  .describe("Repository in 'owner/repo' form (e.g. engenty/engenty-pro).");

const listReposInput = z.object({
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe("Maximum repositories to return (1-50, default 30)."),
});

const getRepoInput = z.object({ repo: repoFullName });

const getPullInput = z.object({
  repo: repoFullName,
  number: z.number().int().positive().describe("Pull request number."),
});

const createPullInput = z.object({
  repo: repoFullName,
  title: z.string().min(1).describe("Pull request title."),
  head: z
    .string()
    .min(1)
    .describe("Name of the branch with the changes (e.g. coder/task-123)."),
  base: z
    .string()
    .min(1)
    .describe("Branch to merge into (e.g. the repository default branch)."),
  body: z.string().optional().describe("Pull request description (Markdown)."),
  draft: z
    .boolean()
    .optional()
    .describe("Open the pull request as a draft (default false)."),
});

const actions: ConnectorAction[] = [
  {
    description:
      "List repositories the connected GitHub account can access, most recently updated first.",
    group: "read",
    handler: async (input, ctx) => {
      const args = listReposInput.parse(input);
      const repos = await githubApi<GitHubRepo[]>(
        ctx,
        `/user/repos?per_page=${args.limit ?? 30}&sort=updated&affiliation=owner,collaborator,organization_member`
      );
      return { repositories: repos.map(mapRepo) };
    },
    id: "repos_list",
    inputSchema: listReposInput,
    providerScopes: [],
    summary: "List GitHub repositories",
  },
  {
    description:
      "Fetch metadata for a single repository (default branch, visibility).",
    group: "read",
    handler: async (input, ctx) => {
      const args = getRepoInput.parse(input);
      const repo = await githubApi<GitHubRepo>(ctx, `/repos/${args.repo}`);
      return mapRepo(repo);
    },
    id: "repo_get",
    inputSchema: getRepoInput,
    providerScopes: [],
    summary: "Get a GitHub repository",
  },
  {
    description:
      "Fetch a pull request by number (state, branches, merge status, URL).",
    group: "read",
    handler: async (input, ctx) => {
      const args = getPullInput.parse(input);
      const pull = await githubApi<GitHubPull>(
        ctx,
        `/repos/${args.repo}/pulls/${args.number}`
      );
      return mapPull(pull);
    },
    id: "pr_get",
    inputSchema: getPullInput,
    providerScopes: [],
    summary: "Get a GitHub pull request",
  },
  {
    description:
      "Open a pull request from an already-pushed head branch into a base branch.",
    group: "write",
    handler: async (input, ctx) => {
      const args = createPullInput.parse(input);
      const pull = await githubApi<GitHubPull>(
        ctx,
        `/repos/${args.repo}/pulls`,
        {
          method: "POST",
          body: {
            title: args.title,
            head: args.head,
            base: args.base,
            ...(args.body === undefined ? {} : { body: args.body }),
            ...(args.draft === undefined ? {} : { draft: args.draft }),
          },
        }
      );
      return mapPull(pull);
    },
    id: "pr_create",
    inputSchema: createPullInput,
    providerScopes: [],
    summary: "Create a GitHub pull request",
  },
];

export const githubConnector = defineConnector({
  actions,
  auth: {
    kind: "oauth2",
    oauth2: {
      authUrl: "https://github.com/login/oauth/authorize",
      // `repo` up front so enabling pr_create later never forces re-consent.
      baseScopes: ["repo"],
      clientIdEnv: "GITHUB_OAUTH_CLIENT_ID",
      clientSecretEnv: "GITHUB_OAUTH_CLIENT_SECRET",
      resolveAccount: async (accessToken, fetchImpl) => {
        const response = await fetchImpl(`${GITHUB_API_BASE}/user`, {
          headers: {
            accept: "application/vnd.github+json",
            authorization: `Bearer ${accessToken}`,
            "x-github-api-version": GITHUB_API_VERSION,
          },
        });
        if (!response.ok) {
          throw new Error(
            `github_http_error: /user returned ${response.status}`
          );
        }
        const data = (await response.json()) as {
          id?: number;
          login?: string;
        };
        return {
          label: data.login ?? "GitHub",
          ...(data.id ? { externalId: String(data.id) } : {}),
        };
      },
      scopeSeparator: " ",
      // GitHub returns a form-encoded token body unless JSON is requested.
      tokenRequestHeaders: { accept: "application/json" },
      tokenUrl: "https://github.com/login/oauth/access_token",
    },
  },
  description:
    "GitHub access as the connected account: repositories and pull requests.",
  icon: "logo:github",
  id: "github",
  moduleId: "connections-github",
  name: "GitHub",
  toolPrefix: "github",
});
