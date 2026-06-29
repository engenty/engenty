/**
 * Build GitHub "blob" URLs for doc pages. Most pages live under docs/content
 * in git; package docs may be symlinked from packages (e.g. under
 * docs/content/dev/packages/).
 */

const MOUNTS: readonly { contentPrefix: string; repoDir: string }[] = [
  { contentPrefix: "dev/packages/ai-core/", repoDir: "packages/ai-core/docs/" },
  { contentPrefix: "dev/packages/ai-ui/", repoDir: "packages/ai-ui/docs/" },
  { contentPrefix: "dev/packages/ui-core/", repoDir: "packages/ui-core/docs/" },
  {
    contentPrefix: "dev/packages/app-shell/",
    repoDir: "packages/app-shell/docs/",
  },
  {
    contentPrefix: "dev/packages/auth-ui/",
    repoDir: "packages/auth-ui/docs/",
  },
  {
    contentPrefix: "dev/packages/ag-ui-bridge/",
    repoDir: "packages/ag-ui-bridge/docs/",
  },
];

function getRepoBlobRoot(): string {
  const explicit = process.env.NEXT_PUBLIC_DOCS_GITHUB_REPO_BLOB_ROOT;
  if (explicit) return explicit.replace(/\/$/, "");
  const legacy = process.env.NEXT_PUBLIC_DOCS_GITHUB_BLOB_PREFIX;
  if (legacy) {
    const normalized = legacy.replace(/\/$/, "");
    if (normalized.endsWith("/docs/content")) {
      return normalized.slice(0, -"/docs/content".length);
    }
  }
  return "https://github.com/engenty/engenty/blob/main";
}

export function githubRepoRelativePath(pagePath: string): string {
  for (const { contentPrefix, repoDir } of MOUNTS) {
    if (pagePath.startsWith(contentPrefix)) {
      return `${repoDir}${pagePath.slice(contentPrefix.length)}`;
    }
  }
  return `docs/content/${pagePath}`;
}

export function githubUrlForPage(pagePath: string): string {
  const root = getRepoBlobRoot();
  return `${root}/${githubRepoRelativePath(pagePath)}`;
}
