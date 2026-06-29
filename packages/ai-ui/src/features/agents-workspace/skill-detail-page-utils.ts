import type { AiSkillRecord } from "../../lib/admin/ai-runtime-api";
import { formatDetailTimestamp } from "./detail-page-meta";
import { getSkillModuleId } from "./skill-record-utils";

export function formatSkillSourceLabel(
  skill: AiSkillRecord | null,
  t: (key: string) => string
) {
  if (!skill) {
    return t("skillsDetail.sourceDraft");
  }
  switch (skill.source_kind) {
    case "imported":
      return t("skillsDetail.sourceImported");
    case "user":
      return t("skillsDetail.sourceUser");
    default:
      return t("skillsDetail.sourceSeed");
  }
}

export function formatSkillReferenceLabel(
  skill: AiSkillRecord | null,
  t: (key: string) => string
) {
  if (!skill) {
    return t("skillsDetail.unsetValue");
  }
  if (skill.reference_kind === "tenant") {
    return t("skillsDetail.referenceTenantCustom");
  }
  return skill.source_reference || getSkillModuleId(skill);
}

export function getSkillSyncMeta(
  skill: AiSkillRecord | null,
  t: (key: string) => string
) {
  if (!skill) {
    return null;
  }
  if (skill.source_kind === "user") {
    return {
      label: t("skillsDetail.metaLastUpdated"),
      value:
        formatDetailTimestamp(skill.updated_at) ?? t("skillsDetail.unsetValue"),
    };
  }
  const synced =
    formatDetailTimestamp(skill.last_seeded_at) ??
    formatDetailTimestamp(skill.last_synced_at);
  return {
    label:
      skill.source_kind === "imported"
        ? t("skillsDetail.metaLastSynced")
        : t("skillsDetail.metaLastSeeded"),
    value: synced ?? t("skillsDetail.unsetValue"),
  };
}

export function formatSkillLicenseLabel(
  skill: AiSkillRecord | null,
  t: (key: string) => string
) {
  const explicitLicense = skill?.license?.trim();
  if (explicitLicense) {
    return explicitLicense;
  }
  if (!skill) {
    return "-";
  }
  if (skill.source_kind === "user") {
    return t("skillsDetail.licenseCustomFallback");
  }
  if (
    skill.source_kind === "seed" &&
    getSkillModuleId(skill) === "engenty-core"
  ) {
    return t("skillsDetail.licenseEngentyFallback");
  }
  return "-";
}
