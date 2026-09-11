/**
 * The `Offers` root, contributed to the space Data pane.
 *
 * The generic view of this folder is three rows reading "draft", "ready",
 * "accepted" — the names of the stages and nothing about them. A pipeline's
 * index should say how much is IN each stage, because that is the question
 * anyone opening it has.
 *
 * One request per stage asking only for the TOTAL (`page: 1, pageSize: 1`,
 * count off the envelope), the same shape the contacts root uses. The first
 * cut grouped one 200-row page client-side — `/api/offers` caps `pageSize`
 * at 200, so that count silently stopped being true at the 201st offer.
 * `meta.total` is exact at any size.
 */
import { useTranslation } from "@engenty/i18n/ui";
import { Spinner, uiStatusCardClassName } from "@engenty/ui-core";
import type { UiTabRenderProps } from "@engenty/ui-plugin-sdk";
import { ChevronRight } from "lucide-react";
import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import type { OfferStatus } from "../api.js";
import { useOffersListQuery } from "../queries.js";

/** One entry of the host's listing, as much of it as this view reads. */
interface FolderRow {
  name: string;
  path: string;
}

function isFolderRow(value: unknown): value is FolderRow {
  if (!value || typeof value !== "object") {
    return false;
  }
  const row = value as Record<string, unknown>;
  return typeof row.name === "string" && typeof row.path === "string";
}

/**
 * `total` from the list envelope for one stage. `hasData` is separate so a
 * failed count renders "—", never 0 — a stage reported as empty when nobody
 * actually looked.
 */
function useOfferStatusTotal(status: OfferStatus) {
  const query = useOffersListQuery({ page: 1, pageSize: 1, status });
  return { hasData: Boolean(query.data), total: query.data?.total ?? 0 };
}

export function SpaceDataOffersRootTab({ params }: UiTabRenderProps) {
  const { t } = useTranslation("offers");
  const { spaceKey = "" } = useParams();
  const folders = useMemo(
    () =>
      Array.isArray(params.folders) ? params.folders.filter(isFolderRow) : [],
    [params.folders]
  );
  // One hook per stage because the stages are a fixed set (the adapter's
  // STATUSES); a folder outside it simply shows "—".
  const draft = useOfferStatusTotal("draft");
  const ready = useOfferStatusTotal("ready");
  const accepted = useOfferStatusTotal("accepted");
  const totals: Partial<
    Record<OfferStatus, { hasData: boolean; total: number }>
  > = { accepted, draft, ready };

  if (params.isPending === true) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-6">
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {folders.map((folder) => {
          const stage = totals[folder.name as OfferStatus];
          return (
            <li key={folder.path}>
              <Link
                className={uiStatusCardClassName}
                to={`/s/${encodeURIComponent(spaceKey)}/data?as=folder&path=${encodeURIComponent(folder.path)}`}
              >
                <span className="flex items-center gap-1 font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  {t(`statusLabels.${folder.name}`, {
                    defaultValue: folder.name,
                  })}
                  <ChevronRight className="size-3.5" />
                </span>
                <span className="font-semibold text-2xl tabular-nums">
                  {stage?.hasData ? stage.total : "—"}
                </span>
                <span className="text-muted-foreground text-xs">
                  {t("spaceData.root.offers", {
                    count: stage?.total ?? 0,
                    defaultValue: "offers",
                  })}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
