import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Changelog",
  description:
    "Release history for Engenty, generated from Conventional Commits.",
};

interface CliffCommit {
  breaking: boolean;
  group: string | null;
  id: string;
  message: string;
}

interface CliffRelease {
  commits: CliffCommit[];
  timestamp: number | null;
  version: string | null;
}

const CHANGELOG_JSON_PATH = path.join(
  process.cwd(),
  "..",
  "..",
  "changelog.json",
);

function loadReleases(): CliffRelease[] {
  if (!existsSync(CHANGELOG_JSON_PATH)) {
    return [];
  }
  try {
    const raw = readFileSync(CHANGELOG_JSON_PATH, "utf8");
    const releases = JSON.parse(raw) as CliffRelease[];
    return releases
      .filter((r) => r.commits.length > 0)
      .sort(
        (a, b) =>
          (b.timestamp ?? Number.MAX_SAFE_INTEGER) -
          (a.timestamp ?? Number.MAX_SAFE_INTEGER),
      );
  } catch {
    return [];
  }
}

function formatDate(timestamp: number | null): string {
  if (!timestamp) {
    return "";
  }
  return new Date(timestamp * 1000).toISOString().slice(0, 10);
}

// Deterministic per-group accent so the bullet list stays scannable without
// full section headers — keeps the compact "- Group: description" format.
const GROUP_DOT: Record<string, string> = {
  Added: "bg-emerald-500",
  Deploy: "bg-sky-500",
  Docs: "bg-fd-muted-foreground",
  Fixed: "bg-amber-500",
  Other: "bg-fd-muted-foreground",
  Performance: "bg-violet-500",
};

export default function ChangelogPage() {
  const releases = loadReleases();

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-2xl font-bold">Changelog</h1>
      <p className="mt-2 text-fd-muted-foreground">
        Release history for Engenty, generated from{" "}
        <a
          className="text-fd-primary underline"
          href="https://www.conventionalcommits.org/"
        >
          Conventional Commits
        </a>{" "}
        via{" "}
        <a className="text-fd-primary underline" href="https://git-cliff.org">
          git-cliff
        </a>
        .
      </p>

      {releases.length === 0 ? (
        <p className="mt-8 text-fd-muted-foreground">No releases yet.</p>
      ) : (
        <div className="mt-8 flex flex-col gap-10">
          {releases.map((release) => (
            <section key={release.version ?? "unreleased"}>
              <h2 className="flex items-baseline gap-3 text-lg font-semibold">
                {release.version
                  ? release.version.replace(/^v/, "")
                  : "Unreleased"}
                {release.timestamp ? (
                  <span className="text-sm font-normal text-fd-muted-foreground">
                    {formatDate(release.timestamp)}
                  </span>
                ) : null}
              </h2>
              <ul className="mt-3 flex flex-col gap-1.5">
                {release.commits.map((commit) => (
                  <li
                    className="flex items-start gap-2 text-sm"
                    key={commit.id}
                  >
                    <span
                      className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                        GROUP_DOT[commit.group ?? "Other"] ?? GROUP_DOT.Other
                      }`}
                    />
                    <span>
                      <span className="font-medium">
                        {commit.group ?? "Other"}:
                      </span>{" "}
                      {commit.message}
                      {commit.breaking ? (
                        <span className="ml-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 text-xs font-medium text-red-500">
                          breaking
                        </span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
