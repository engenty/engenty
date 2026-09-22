/**
 * `/mdl/<module>/<record>` → `/s/<spaceKey>/<module>/<record>`
 * (PLAN-spaces.md Phase 5a, Routing).
 *
 * Notification links, search hits and agent-produced refs already in flight
 * carry the pre-space shape. The plan calls this "the boring part of Phase 5
 * that bites": without it every one of them 404s the day the module moves into
 * a space.
 *
 * Only SPACE-placed modules redirect. A global app keeps `/mdl/` as its
 * canonical path — sending the inbox into a space would be a lie about where it
 * lives.
 */
import { useQuery } from "@engenty/query-client";
import { Navigate, useLocation } from "react-router-dom";
import { resolveRecordSpace } from "@/lib/api/spaces-client";
import { parseLegacyModuleLink } from "@/lib/space-route-mirrors";
import { spaceModulePath } from "@/lib/space-routes";
import { rememberedSpaceKey } from "@/lib/use-route-space";

export function LegacyModuleRedirect({
  Fallback,
}: {
  Fallback: React.ComponentType;
}) {
  const location = useLocation();
  const link = parseLegacyModuleLink(location.pathname);

  // A module's OWN link, followed from inside a space, needs no lookup at all.
  // `/mdl/tasks/briefing` names no record, so rule 1 below (the record's own
  // space) cannot apply and rule 2 already has the answer synchronously. Asking
  // the server anyway is what made the Plan tab flash: `TasksRedirectPage`
  // sends `/s/<key>/tasks` out to the absolute `/mdl/tasks/briefing`, and this
  // component then rendered BLANK for a whole request round trip — with the URL
  // outside `/s/…`, so the space's sidebar unmounted and came back too. It read
  // as a page reload because, visually, that is what it was.
  const remembered = link && !link.recordId ? rememberedSpaceKey() : null;

  const query = useQuery({
    enabled: Boolean(link) && !remembered,
    queryFn: ({ signal }) =>
      resolveRecordSpace(
        {
          moduleId: link?.moduleId ?? "",
          ...(link?.recordId ? { recordId: link.recordId } : {}),
        },
        signal
      ),
    queryKey: ["spaces", "resolve-record", link?.moduleId, link?.recordId],
    // A deep link is opened once and the answer cannot change while the user
    // looks at a redirect; refetching it would only add a flash.
    staleTime: Number.POSITIVE_INFINITY,
  });

  if (!link) {
    return <Fallback />;
  }
  if (remembered) {
    return (
      <Navigate
        replace
        to={
          spaceModulePath(remembered, link.moduleId, link.rest) +
          location.search +
          location.hash
        }
      />
    );
  }
  if (query.isPending) {
    // Deliberately blank rather than a spinner: this resolves in one request and
    // a spinner that flashes for 80ms reads as a broken page.
    return null;
  }
  if (!query.data) {
    // The lookup failed — render the module where the link pointed rather than
    // bouncing the user to a space that may not be the right one. The page
    // still works; only the URL stays old.
    return <Fallback />;
  }
  // Which space to land in, in order of authority:
  //  1. the record's own space — it is where the thing actually lives;
  //  2. the space the user was just in — a module's internal `/mdl/…` link
  //     followed from inside a space must not relocate them;
  //  3. the tenant default — for a cold deep link from outside the app.
  const spaceKey =
    query.data.source === "record"
      ? query.data.key
      : (rememberedSpaceKey() ?? query.data.key);

  return (
    <Navigate
      replace
      to={
        spaceModulePath(spaceKey, link.moduleId, link.rest) +
        location.search +
        location.hash
      }
    />
  );
}
