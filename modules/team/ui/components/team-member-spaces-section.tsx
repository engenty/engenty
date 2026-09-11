/**
 * The spaces a person works in, on their Team profile (PLAN-spaces.md Phase P).
 *
 * Spaces are a CORE concept, so this reads core's `/api/spaces/memberships`
 * rather than anything under `/api/team`. The team module owns the person; core
 * owns where they work.
 *
 * **Scoped to the reader, not the subject.** The endpoint returns the
 * intersection of the person's memberships with the spaces the caller may
 * themselves enter — a profile that listed every room someone belongs to would
 * be a directory of private spaces and their occupants, which is precisely what
 * per-space access control exists to prevent. Personal spaces cannot appear at
 * all: they hold no member rows.
 *
 * A person with no `user_id` has no engenty account yet (imported or invited but
 * not accepted), so there is nothing to look up and the section is absent rather
 * than empty.
 */
import { requestApiJson } from "@engenty/api-client";
import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import { CardSection } from "@engenty/ui-core";
import { Link } from "react-router-dom";

interface MembershipSpace {
  color: string | null;
  id: string;
  key: string;
  name: string;
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return "?";
  }
  if (words.length === 1) {
    return (words[0] ?? "").slice(0, 2).toUpperCase();
  }
  return `${words[0]?.[0] ?? ""}${words[1]?.[0] ?? ""}`.toUpperCase();
}

/**
 * Through the shared client, not a bare `fetch`: it attaches the bearer token
 * and unwraps the `{ ok, data }` envelope. A raw fetch here sent no credentials
 * at all and would have 401'd on every profile.
 */
function fetchMemberSpaces(
  userId: string,
  signal?: AbortSignal
): Promise<MembershipSpace[]> {
  return requestApiJson<MembershipSpace[]>(
    `/api/spaces/memberships?user_id=${encodeURIComponent(userId)}`,
    { signal }
  );
}

export function TeamMemberSpacesSection({ userId }: { userId: string | null }) {
  const { t } = useTranslation("team");
  const query = useQuery({
    enabled: Boolean(userId),
    queryFn: ({ signal }) => fetchMemberSpaces(userId as string, signal),
    queryKey: ["team", "member-spaces", userId ?? ""],
  });

  if (!userId) {
    return null;
  }

  const spaces = query.data ?? [];

  return (
    <CardSection
      description={t("spacesSectionDescription", {
        defaultValue: "Shared spaces you can both see.",
      })}
      title={t("spacesSection", { defaultValue: "Spaces" })}
    >
      {query.isPending ? (
        <div className="flex flex-col gap-1.5">
          {[0, 1].map((index) => (
            <div
              className="h-7 animate-pulse rounded-md bg-muted"
              key={index}
            />
          ))}
        </div>
      ) : null}
      {!query.isPending && spaces.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {t("spacesSectionEmpty", {
            defaultValue: "No shared spaces in common.",
          })}
        </p>
      ) : null}
      <div className="flex flex-col gap-0.5">
        {spaces.map((space) => (
          <Link
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/60"
            key={space.id}
            to={`/s/${encodeURIComponent(space.key)}`}
          >
            <span
              aria-hidden
              className="grid size-5 shrink-0 place-items-center rounded-[6px] font-semibold text-[9px] text-white"
              // The space's own colour, matching the rail tile — the same place
              // seen twice should look the same both times.
              style={{ backgroundColor: space.color || "var(--primary)" }}
            >
              {initials(space.name)}
            </span>
            <span className="truncate">{space.name}</span>
          </Link>
        ))}
      </div>
    </CardSection>
  );
}
