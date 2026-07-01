/**
 * KB personal favorites — scoped and legacy `/mdl/knowledge-base/favorites`.
 */

import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo } from "react";
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { KbModuleShellActions } from "../components/kb-module-shell-actions.js";
import {
  favoritesNavQueryOptions,
  useKbRemoveFavoriteNavMutation,
} from "../favorites-nav-queries.js";
import { useKbModuleSecondaryShellNav } from "../hooks/use-kb-module-secondary-shell-nav.js";
import { kbFavoritesListPath } from "../kb-paths.js";
import {
  kbModulePageShellInnerNarrowClassName,
  kbModulePageShellSectionClassName,
} from "../lib/kb-page-shell.js";
import { kbSettingsQueryOptions, kbsQueryOptions } from "../queries.js";
import {
  kbIdFromSlug,
  resolveKbIdFromUrl,
  slugFromKbId,
  tenantDefaultKbId,
} from "../resolve-kb-id.js";

const FAVORITES_LIST_PATH = "/mdl/knowledge-base/favorites";

export function KbFavoritesListPage() {
  const { t } = useTranslation("kb");
  const navigate = useNavigate();
  const location = useLocation();
  const { kbSlug: kbSlugParam } = useParams<{ kbSlug?: string }>();
  const [searchParams] = useSearchParams();

  const { data: kbs = [], isLoading: kbsLoading } = useQuery(kbsQueryOptions);
  const { data: kbSettings } = useQuery(kbSettingsQueryOptions);
  const tenantDefault = tenantDefaultKbId(kbSettings);

  const kbId = useMemo(() => {
    if (kbSlugParam?.trim()) {
      return kbIdFromSlug(kbs, kbSlugParam);
    }
    return resolveKbIdFromUrl(searchParams, kbs, tenantDefault);
  }, [kbSlugParam, searchParams, kbs, tenantDefault]);

  const kbSlug = useMemo(() => slugFromKbId(kbs, kbId) ?? "", [kbs, kbId]);

  useEffect(() => {
    if (kbsLoading || !kbs.length || !kbId) {
      return;
    }
    const slug = slugFromKbId(kbs, kbId);
    if (!slug) {
      return;
    }
    if (kbSlugParam) {
      return;
    }
    if (location.pathname === FAVORITES_LIST_PATH) {
      navigate(`${kbFavoritesListPath(slug)}${location.search}`, {
        replace: true,
      });
    }
  }, [
    kbsLoading,
    kbs,
    kbId,
    kbSlugParam,
    location.pathname,
    location.search,
    navigate,
  ]);

  const navigateKb = useCallback(
    (nextKbId: string) => {
      const nextSlug = slugFromKbId(kbs, nextKbId);
      if (!nextSlug) {
        return;
      }
      navigate(kbFavoritesListPath(nextSlug));
    },
    [kbs, navigate]
  );

  const { data: doc, isLoading: favLoading } = useQuery(
    favoritesNavQueryOptions()
  );
  const removeMut = useKbRemoveFavoriteNavMutation();
  const items = doc?.items ?? [];

  const kbShellNav = useKbModuleSecondaryShellNav({
    kbId,
    kbSlug: kbSlug ?? "",
    onKbChange: navigateKb,
  });

  usePageConfig({
    topbarChrome: "contentBlend",
    contentStackBackground: "paper",
    actions: kbSlug ? <KbModuleShellActions kbSlug={kbSlug} /> : null,
    breadcrumbs: [
      ...(kbShellNav.kbRootCrumb ? [kbShellNav.kbRootCrumb] : []),
      { label: t("favorites.nav_link") },
    ],
    secondaryNavAfterItems: kbShellNav.secondaryNavAfterItems,
    secondaryNavHeaderSlot: kbShellNav.secondaryNavHeaderSlot,
  });

  return (
    <section className={kbModulePageShellSectionClassName}>
      <div className={kbModulePageShellInnerNarrowClassName}>
        <div>
          <h1 className="font-heading text-[28px] leading-9 tracking-tight">
            {t("favorites.page_heading")}
          </h1>
          <p className="mt-1 text-muted-foreground text-sm">
            {t("favorites.page_intro")}
          </p>
        </div>

        <Card>
          <CardHeader className="p-4 sm:p-5">
            <CardTitle className="text-base">
              {t("favorites.nav_link")}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 sm:px-5 sm:pb-5">
            {kbsLoading || favLoading ? (
              <p className="text-muted-foreground text-sm">
                {t("favorites.loading")}
              </p>
            ) : items.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                {t("favorites.empty")}
              </p>
            ) : (
              <ul className="divide-y rounded-md border">
                {items.map((row) => (
                  <li
                    className="flex items-start gap-3 px-3 py-2.5 sm:px-4"
                    key={row.to}
                  >
                    <div className="min-w-0 flex-1">
                      <Link
                        className="font-medium text-foreground hover:underline"
                        to={row.to}
                      >
                        {row.title}
                      </Link>
                      {row.subtitle ? (
                        <p className="text-muted-foreground text-xs">
                          {row.subtitle}
                        </p>
                      ) : null}
                      <p className="mt-0.5 truncate font-mono text-muted-foreground text-xs">
                        {row.to}
                      </p>
                    </div>
                    <Button
                      aria-label={t("favorites.remove_row_aria")}
                      className="shrink-0"
                      disabled={removeMut.isPending}
                      onClick={() => void removeMut.mutateAsync(row.to)}
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
