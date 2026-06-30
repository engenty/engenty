import { Card } from "@engenty/ui-core";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { formatDisplayName } from "../../src/services/profile-name.js";
import type { TeamMemberListItem } from "../api.js";

function BaseInfoRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-4">
      <span className="w-40 shrink-0 text-muted-foreground text-sm sm:w-56">
        {label}
      </span>
      <span className="flex-1 text-sm">{value ?? "-"}</span>
    </div>
  );
}

export interface TeamMemberViewBaseInfoSectionProps {
  member: Pick<
    TeamMemberListItem,
    | "birth_name"
    | "first_name"
    | "full_name"
    | "full_name_override"
    | "last_name"
    | "middle_name"
    | "name_prefix"
    | "name_suffix"
    | "phonetic_name"
  >;
  t: (key: string) => string;
}

/**
 * Returns the toggle button and the collapsible name-details section.
 * The toggle is designed to be passed as `showDetailsToggle` to TeamMemberProfileHeader
 * so it sits inline after the name.
 */
export function useTeamMemberNameDetails(
  member: TeamMemberViewBaseInfoSectionProps["member"],
  t: (key: string) => string
) {
  const [expanded, setExpanded] = useState(false);
  const structuredDisplay = formatDisplayName(member);

  const toggle = (
    <button
      aria-expanded={expanded}
      className="flex items-center gap-1 text-muted-foreground text-xs hover:text-foreground"
      onClick={() => setExpanded((v) => !v)}
      type="button"
    >
      {expanded ? (
        <>
          <ChevronUp className="h-3 w-3" />
          {t("hideDetails")}
        </>
      ) : (
        <>
          <ChevronDown className="h-3 w-3" />
          {t("showDetails")}
        </>
      )}
    </button>
  );

  const details = expanded ? (
    <Card variant="form">
      <div className="space-y-2">
        <BaseInfoRow label={t("displayName")} value={member.full_name} />
        <BaseInfoRow label={t("namePrefix")} value={member.name_prefix} />
        <BaseInfoRow label={t("firstName")} value={member.first_name} />
        <BaseInfoRow label={t("middleName")} value={member.middle_name} />
        <BaseInfoRow label={t("lastName")} value={member.last_name} />
        <BaseInfoRow label={t("nameSuffix")} value={member.name_suffix} />
        <BaseInfoRow label={t("phoneticName")} value={member.phonetic_name} />
        <BaseInfoRow label={t("birthName")} value={member.birth_name} />
        {member.full_name_override?.trim() &&
        member.full_name_override.trim() !== structuredDisplay ? (
          <BaseInfoRow
            label={t("displayNameOverride")}
            value={member.full_name_override}
          />
        ) : null}
      </div>
    </Card>
  ) : null;

  return { toggle, details };
}

/** @deprecated Use useTeamMemberNameDetails hook directly */
export function TeamMemberViewBaseInfoSection({
  member,
  t,
}: TeamMemberViewBaseInfoSectionProps) {
  const { toggle, details } = useTeamMemberNameDetails(member, t);
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">{toggle}</div>
      {details}
    </section>
  );
}
