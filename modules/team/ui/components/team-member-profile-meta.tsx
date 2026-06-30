import { cn } from "@engenty/ui-core";
import { Mail, MapPin, User } from "lucide-react";
import type { TeamMemberListItem } from "../api.js";
import { useTeamMemberTaxonomyTerms } from "../hooks/use-team-member-taxonomy-terms.js";
import { resolveTaxonomyTermLabel } from "../lib/resolve-taxonomy-term-label.js";

type ProfileMetaMember = Pick<
  TeamMemberListItem,
  | "position"
  | "department"
  | "email"
  | "location_term_id"
  | "location_term"
  | "role_term_id"
  | "role_term"
>;

/**
 * Profile sub-lines shared by the dashboard quick-search card and the member
 * detail header: a role/position subtitle plus a location + email row. Renders
 * nothing when the member has no resolvable subtitle, location, or email.
 */
export function TeamMemberProfileMeta({
  member,
  className,
}: {
  member: ProfileMetaMember;
  className?: string;
}) {
  const { locationTerms, roleTerms } = useTeamMemberTaxonomyTerms();

  const roleLabel =
    resolveTaxonomyTermLabel(
      roleTerms,
      member.role_term_id ?? member.role_term,
      ""
    ) || null;
  const locationLabel =
    resolveTaxonomyTermLabel(
      locationTerms,
      member.location_term_id ?? member.location_term,
      ""
    ) || null;

  // Primary subtitle: role > position > department (first truthy)
  const subtitle = roleLabel ?? member.position ?? member.department ?? null;

  if (!(subtitle || locationLabel || member.email)) {
    return null;
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      {subtitle && (
        <p className="flex items-center gap-1.5 text-muted-foreground text-sm">
          <User aria-hidden className="size-3.5 shrink-0" />
          <span>{subtitle}</span>
          {member.department && roleLabel && member.department !== subtitle && (
            <span className="text-muted-foreground/60">
              · {member.department}
            </span>
          )}
        </p>
      )}

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground text-sm">
        {locationLabel && (
          <span className="flex items-center gap-1.5">
            <MapPin aria-hidden className="size-3.5 shrink-0" />
            {locationLabel}
          </span>
        )}
        {member.email && (
          <a
            className="flex items-center gap-1.5 hover:text-foreground hover:underline"
            href={`mailto:${member.email}`}
          >
            <Mail aria-hidden className="size-3.5 shrink-0" />
            {member.email}
          </a>
        )}
      </div>
    </div>
  );
}
