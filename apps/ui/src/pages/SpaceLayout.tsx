/**
 * Everything under `/s/<spaceKey>` (PLAN-spaces.md Phase 5).
 *
 * A pass-through, and deliberately nothing more — except for chats.
 *
 * The space's sidebar — its switcher and its Work/Data/Plan tabs — is rendered
 * by the app shell's own secondary column via `secondaryNavHeaderOverride` /
 * `secondaryNavLeadingSlot` (wired in App.tsx), with the open module's nav
 * directly beneath it. Owning a second column here would produce exactly the two
 * sidebars the plan rules out, and would also lose the shell's collapse/pin,
 * resize and topbar toggle.
 *
 * It must not call `usePageConfig` either, which cost a debugging round to
 * learn: that store is last-writer-wins on ONE global, and a layout's effects
 * run AFTER its children's, so this component setting a breadcrumb also wrote
 * `secondaryNavAfterItems ?? null` — silently wiping the tasks and
 * knowledge-base sidebars the module below had just published. The space is
 * named by the switcher at the top of the column, which is where the breadcrumb
 * starts; the topbar continues it with whatever the module contributes.
 *
 * Chats (a desk, the copilot) are the one thing kept: the last few stay
 * mounted but hidden (`<Activity>`), so walking back to one only shows it
 * again — its transcript, scroll and draft as left — instead of building the
 * desk anew. A hidden desk runs no effects; each reads the location it was
 * left at, so its params and search stay its own.
 */
import {
  Activity,
  type ContextType,
  memo,
  type ReactNode,
  useRef,
} from "react";
import {
  type Location,
  Outlet,
  UNSAFE_RouteContext as RouteContext,
  Routes,
  useLocation,
} from "react-router-dom";

const KEPT_CHATS = 3;

/** The chat a pathname opens, or null for any other page of the space. */
function chatKeyOf(pathname: string): string | null {
  const match = /^\/s\/([^/]+)\/(copilot|agents\/([^/]+))\/?$/.exec(pathname);
  if (!match || match[3] === "new") {
    return null;
  }
  return `${match[1]}/${match[2]}`;
}

function isSamePlace(left: Location, right: Location): boolean {
  return (
    left.pathname === right.pathname &&
    left.search === right.search &&
    left.hash === right.hash &&
    left.state === right.state
  );
}

interface KeptChat {
  key: string;
  location: Location;
}

/**
 * The route context a kept chat matches under: the root's, and always the same
 * object. Under the live `/s/:spaceKey` match it would get a new context on
 * every navigation, and every `useParams`/`useNavigate` in every kept desk —
 * hidden ones too — would redraw with it. Its routes are absolute for that.
 */
const KEPT_CHAT_ROUTE_CONTEXT: ContextType<typeof RouteContext> = {
  isDataRoute: false,
  matches: [],
  outlet: null,
};

/**
 * One kept chat. Re-renders only when its own location (or the route set)
 * changes: the route elements are rebuilt on every navigation, and without
 * this each kept desk — hidden ones too — would redraw on every click.
 */
const KeptChatRoutes = memo(
  function KeptChatRoutes(props: {
    chatRoutes: ReactNode;
    chatRoutesKey: string;
    location: Location;
  }) {
    return (
      <RouteContext.Provider value={KEPT_CHAT_ROUTE_CONTEXT}>
        <Routes location={props.location}>{props.chatRoutes}</Routes>
      </RouteContext.Provider>
    );
  },
  (previous, next) =>
    previous.location === next.location &&
    previous.chatRoutesKey === next.chatRoutesKey
);

export function SpaceLayout({
  chatRoutes,
  chatRoutesKey,
}: {
  chatRoutes: ReactNode;
  /** Changes when the chat routes' elements do (their props). */
  chatRoutesKey: string;
}) {
  const location = useLocation();
  const activeKey = chatKeyOf(location.pathname);
  const spaceKey = location.pathname.split("/")[2] ?? "";
  // Most recent first. Updated during render (idempotent): the chat being
  // opened must be in the list on the render that shows it.
  const keptRef = useRef<KeptChat[]>([]);
  let kept = keptRef.current.filter(
    // Another space's chats resolve against another parent route; they are
    // not kept across a space switch.
    (entry) => entry.key.startsWith(`${spaceKey}/`)
  );
  if (activeKey) {
    const previous = kept.find((entry) => entry.key === activeKey);
    kept = [
      {
        key: activeKey,
        // Walking back to the same address hands the kept chat the location
        // it already has: a new object for the same place would re-render the
        // whole desk just to show it again.
        location:
          previous && isSamePlace(previous.location, location)
            ? previous.location
            : location,
      },
      ...kept.filter((entry) => entry.key !== activeKey),
    ].slice(0, KEPT_CHATS);
  }
  keptRef.current = kept;

  return (
    <>
      {activeKey ? null : <Outlet />}
      {kept
        // Stable order, so a switch never reorders (and remounts) siblings.
        .toSorted((left, right) => left.key.localeCompare(right.key))
        .map((entry) => (
          <Activity
            key={entry.key}
            mode={entry.key === activeKey ? "visible" : "hidden"}
          >
            <KeptChatRoutes
              chatRoutes={chatRoutes}
              chatRoutesKey={chatRoutesKey}
              location={entry.location}
            />
          </Activity>
        ))}
    </>
  );
}
