import { ExternalLink } from "lucide-react";
import {
  countTextMatches,
  HighlightSearchText,
  type SearchMatchCounter,
} from "@/components/about-search";
import type { ProductCredit } from "@/data/product-credits";

export interface OssCredit {
  homepage?: string;
  license: string;
  name: string;
  version: string;
}

export interface OssCreditGroup {
  id: string;
  kind: "app" | "module" | "package" | "root";
  label: string;
  packages: OssCredit[];
}

export interface OssCreditsData {
  groups: OssCreditGroup[];
  shared: OssCredit[];
}

/** Count only fields that HighlightSearchText actually renders (not homepage hrefs). */
export function creditMatchCount(
  credit: ProductCredit | OssCredit,
  query: string
): number {
  const q = query.trim();
  if (!q) {
    return 0;
  }
  let total = countTextMatches(credit.name, q);
  if (credit.license) {
    total += countTextMatches(credit.license, q);
  }
  if ("version" in credit && credit.version) {
    total += countTextMatches(credit.version, q);
  }
  if ("description" in credit && credit.description) {
    total += countTextMatches(credit.description, q);
  }
  return total;
}

export function CreditRow({
  credit,
  showLicense,
  query = "",
  matchCounter,
  activeMatchIndex = 0,
}: {
  activeMatchIndex?: number;
  credit: ProductCredit | OssCredit;
  matchCounter?: SearchMatchCounter;
  query?: string;
  showLicense?: boolean;
}) {
  const href = "homepage" in credit ? credit.homepage : undefined;
  const license = credit.license;
  const version = "version" in credit ? credit.version : undefined;
  const description = "description" in credit ? credit.description : undefined;
  const counter = matchCounter ?? { current: 0 };
  const highlight = query.trim().length > 0;

  return (
    <li className="flex flex-col gap-0.5 py-2">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        {href ? (
          <a
            className="inline-flex items-center gap-1 font-medium text-foreground text-sm underline-offset-4 hover:underline"
            href={href}
            rel="noopener noreferrer"
            target="_blank"
          >
            {highlight ? (
              <HighlightSearchText
                activeMatchIndex={activeMatchIndex}
                matchCounter={counter}
                query={query}
                text={credit.name}
              />
            ) : (
              credit.name
            )}
            <ExternalLink aria-hidden className="size-3 opacity-60" />
          </a>
        ) : (
          <span className="font-medium text-foreground text-sm">
            {highlight ? (
              <HighlightSearchText
                activeMatchIndex={activeMatchIndex}
                matchCounter={counter}
                query={query}
                text={credit.name}
              />
            ) : (
              credit.name
            )}
          </span>
        )}
        {version ? (
          <span className="text-muted-foreground text-xs">
            {highlight ? (
              <HighlightSearchText
                activeMatchIndex={activeMatchIndex}
                matchCounter={counter}
                query={query}
                text={version}
              />
            ) : (
              version
            )}
          </span>
        ) : null}
        {showLicense && license ? (
          <span className="text-muted-foreground text-xs">
            {highlight ? (
              <HighlightSearchText
                activeMatchIndex={activeMatchIndex}
                matchCounter={counter}
                query={query}
                text={license}
              />
            ) : (
              license
            )}
          </span>
        ) : null}
      </div>
      {description ? (
        <p className="text-muted-foreground text-xs leading-relaxed">
          {highlight ? (
            <HighlightSearchText
              activeMatchIndex={activeMatchIndex}
              matchCounter={counter}
              query={query}
              text={description}
            />
          ) : (
            description
          )}
        </p>
      ) : null}
      {!showLicense && license ? (
        <p className="text-muted-foreground text-xs">
          {highlight ? (
            <HighlightSearchText
              activeMatchIndex={activeMatchIndex}
              matchCounter={counter}
              query={query}
              text={license}
            />
          ) : (
            license
          )}
        </p>
      ) : null}
    </li>
  );
}

export function OssPackageList({
  packages,
  query = "",
  matchCounter,
  activeMatchIndex = 0,
}: {
  activeMatchIndex?: number;
  matchCounter?: SearchMatchCounter;
  packages: OssCredit[];
  query?: string;
}) {
  return (
    <ul className="divide-y divide-border/60 px-6">
      {packages.map((pkg) => (
        <CreditRow
          activeMatchIndex={activeMatchIndex}
          credit={pkg}
          key={`${pkg.name}@${pkg.version}`}
          matchCounter={matchCounter}
          query={query}
          showLicense
        />
      ))}
    </ul>
  );
}

export function kindLabel(
  kind: OssCreditGroup["kind"],
  t: (key: string) => string
): string {
  switch (kind) {
    case "app":
      return t("about.creditsKindApp");
    case "module":
      return t("about.creditsKindModule");
    case "package":
      return t("about.creditsKindPackage");
    default:
      return t("about.creditsKindRoot");
  }
}

export function groupSectionKey(id: string): string {
  return `group:${id}`;
}
