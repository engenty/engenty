"use client";

import { useTranslation } from "@engenty/i18n/ui";
import { PageHeaderProvider, useUiContributions } from "@engenty/ui-plugin-sdk";
import { ExternalLink } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Route,
  Routes,
  UNSAFE_createMemoryHistory,
  UNSAFE_LocationContext,
  UNSAFE_NavigationContext,
  UNSAFE_RouteContext,
  useNavigate,
} from "react-router-dom";
import { PanelWithPageActions } from "../objects/object-pane-body.js";
import { viewRoutes } from "./view-pane-routes.js";

function NoPage({ onOpenFullPage }: { onOpenFullPage: () => void }) {
  const { t } = useTranslation("ai-ui");
  return (
    <div className="flex flex-col items-start gap-2 p-4 text-muted-foreground text-sm">
      <p>{t("artifacts.viewNoPage")}</p>
      <button
        className="inline-flex items-center gap-1 text-foreground text-xs underline-offset-2 hover:underline"
        onClick={onOpenFullPage}
        type="button"
      >
        {t("artifacts.viewOpenFullPage")}
        <ExternalLink className="size-3" />
      </button>
    </div>
  );
}

/**
 * Pane body for the View Pane: a module PAGE rendered beside the chat.
 *
 * The page keeps its own location. It reads `useSearchParams` / `useParams` /
 * `useNavigate` like it does on the real route, so the pane provides a private
 * in-memory history through the router's contexts (a second `<Router>` is not
 * allowed inside the app's one) — `?file=…` and in-page navigation stay in the
 * pane and never move the address bar. The Space still comes from the real URL
 * through WorkspaceContext, which is the desk's Space.
 *
 * As in ObjectPaneBody, the page's breadcrumbs are kept out of the shell and
 * its topbar actions are rendered above it.
 */
export function ViewPaneBody({
  onOpenFullPage,
  path,
}: {
  onOpenFullPage?: (path: string) => void;
  path: string;
}) {
  const { t } = useTranslation("ai-ui");
  const outerNavigate = useNavigate();
  const { contributions } = useUiContributions();
  const routes = useMemo(
    () => viewRoutes(contributions.routes),
    [contributions.routes]
  );

  const historyRef =
    useRef<ReturnType<typeof UNSAFE_createMemoryHistory>>(null);
  if (!historyRef.current) {
    // v5Compat: without it the memory history notifies listeners on POP only,
    // so a push (a later `open_view`, a link in the page) never re-renders.
    historyRef.current = UNSAFE_createMemoryHistory({
      initialEntries: [path],
      v5Compat: true,
    });
  }
  const history = historyRef.current;
  const [state, setState] = useState({
    action: history.action,
    location: history.location,
  });
  useEffect(() => history.listen(setState), [history]);
  // A later `open_view` swaps the path in place.
  const lastPath = useRef(path);
  useEffect(() => {
    if (lastPath.current !== path) {
      lastPath.current = path;
      history.push(path);
    }
  }, [history, path]);

  const openFullPage = () => {
    const { location } = state;
    const target = `${location.pathname}${location.search}${location.hash}`;
    if (onOpenFullPage) {
      onOpenFullPage(target);
      return;
    }
    outerNavigate(target);
  };

  const navigationValue = useMemo(
    () => ({
      basename: "/",
      future: {},
      navigator: history,
      static: false,
      useTransitions: false,
    }),
    [history]
  );
  const locationValue = useMemo(
    () => ({ location: state.location, navigationType: state.action }),
    [state.action, state.location]
  );
  const routeValue = useMemo(
    () => ({ isDataRoute: false, matches: [], outlet: null }),
    []
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <UNSAFE_NavigationContext.Provider value={navigationValue}>
          <UNSAFE_LocationContext.Provider value={locationValue}>
            <UNSAFE_RouteContext.Provider value={routeValue}>
              <PageHeaderProvider>
                <PanelWithPageActions>
                  <Routes>
                    {routes.map((route) => (
                      <Route
                        element={<route.Component />}
                        key={route.path}
                        path={route.path}
                      />
                    ))}
                    <Route
                      element={<NoPage onOpenFullPage={openFullPage} />}
                      path="*"
                    />
                  </Routes>
                </PanelWithPageActions>
              </PageHeaderProvider>
            </UNSAFE_RouteContext.Provider>
          </UNSAFE_LocationContext.Provider>
        </UNSAFE_NavigationContext.Provider>
      </div>
      <div className="border-border-soft border-t px-3 py-2">
        <button
          className="inline-flex items-center gap-1 text-muted-foreground text-xs transition-colors hover:text-foreground"
          onClick={openFullPage}
          type="button"
        >
          {t("artifacts.viewOpenFullPage")}
          <ExternalLink className="size-3" />
        </button>
      </div>
    </div>
  );
}
