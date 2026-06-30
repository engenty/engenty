import { useTranslation } from "@engenty/i18n/ui";
import { useMutation, useQuery, useQueryClient } from "@engenty/query-client";
import {
  Button,
  SettingsFormSection,
  Skeleton,
  TopbarActionLabel,
  topbarIconButtonClassName,
} from "@engenty/ui-core";
import { AnimatedLoaderIcon } from "@engenty/ui-icons";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { Save } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  TEAM_MEMBER_FIELD_VISIBILITY_ORDER,
  type TeamMemberFieldDefinitionInput,
} from "../../src/schema/member-field-definitions.js";
import { putMemberFieldDefinitions } from "../api.js";
import { TeamGlobalSettingsLayout } from "../components/team-global-settings-layout.js";
import { TeamMemberFieldDefinitionsSectionEditor } from "../components/team-member-field-definitions-section-editor.js";
import { normalizeTeamMemberFieldDefinitionsForSave } from "../lib/team-member-field-definitions-lib.js";
import {
  memberFieldDefinitionsQueryOptions,
  teamGlobalSettingsKeys,
} from "../team-global-settings-queries.js";

export function TeamGlobalSettingsFieldsPage() {
  const { t } = useTranslation("team");
  const queryClient = useQueryClient();
  const definitionsQuery = useQuery(memberFieldDefinitionsQueryOptions());
  const [definitions, setDefinitions] = useState<
    TeamMemberFieldDefinitionInput[]
  >([]);
  const [savedSnapshot, setSavedSnapshot] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const syncedRef = useRef(false);

  useEffect(() => {
    if (!definitionsQuery.data || syncedRef.current) {
      return;
    }
    syncedRef.current = true;
    const snapshot = JSON.stringify(
      normalizeTeamMemberFieldDefinitionsForSave(definitionsQuery.data)
    );
    setSavedSnapshot(snapshot);
    setDefinitions(definitionsQuery.data);
  }, [definitionsQuery.data]);

  const dirty = useMemo(() => {
    const current = JSON.stringify(
      normalizeTeamMemberFieldDefinitionsForSave(definitions)
    );
    return Boolean(savedSnapshot) && current !== savedSnapshot;
  }, [definitions, savedSnapshot]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      setSaveError(null);
      const payload = normalizeTeamMemberFieldDefinitionsForSave(definitions);
      return putMemberFieldDefinitions(payload);
    },
    onSuccess: (saved) => {
      const snapshot = JSON.stringify(
        normalizeTeamMemberFieldDefinitionsForSave(saved)
      );
      setSavedSnapshot(snapshot);
      setDefinitions(saved);
      queryClient.setQueryData(
        teamGlobalSettingsKeys.memberFieldDefinitions(),
        saved
      );
    },
    onError: (error) => {
      setSaveError(
        error instanceof Error ? error.message : t("memberFields.save_failed")
      );
    },
  });

  const pageActions = useMemo(
    () => (
      <Button
        className={topbarIconButtonClassName}
        disabled={!dirty || saveMutation.isPending}
        onClick={() => saveMutation.mutate()}
        size="sm"
        type="button"
      >
        {saveMutation.isPending ? (
          <AnimatedLoaderIcon
            aria-hidden
            className="md:mr-1.5"
            play="always"
            size="sm"
          />
        ) : (
          <Save aria-hidden className="h-4 w-4 md:mr-1.5" />
        )}
        <TopbarActionLabel>
          {saveMutation.isPending ? t("loading") : t("save")}
        </TopbarActionLabel>
      </Button>
    ),
    [dirty, saveMutation, t]
  );

  usePageConfig({
    actions: definitionsQuery.isLoading ? null : pageActions,
  });

  if (definitionsQuery.isLoading) {
    return (
      <TeamGlobalSettingsLayout>
        {TEAM_MEMBER_FIELD_VISIBILITY_ORDER.map((visibility) => (
          <div className="space-y-3" key={visibility}>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-96" />
            <Skeleton className="h-40 w-full" />
          </div>
        ))}
      </TeamGlobalSettingsLayout>
    );
  }

  if (definitionsQuery.isError) {
    return (
      <TeamGlobalSettingsLayout>
        <p className="text-destructive text-sm">
          {t("memberFields.load_failed")}
        </p>
      </TeamGlobalSettingsLayout>
    );
  }

  return (
    <TeamGlobalSettingsLayout>
      <header className="space-y-1">
        <p className="text-muted-foreground text-sm">
          {t("memberFields.page_description")}
        </p>
        {saveError ? (
          <p className="text-destructive text-sm">{saveError}</p>
        ) : null}
        {saveMutation.isSuccess && !dirty ? (
          <p className="text-muted-foreground text-sm">
            {t("memberFields.save_success")}
          </p>
        ) : null}
      </header>

      {TEAM_MEMBER_FIELD_VISIBILITY_ORDER.map((visibility) => (
        <SettingsFormSection
          cardVariant="compact"
          description={t(`memberFields.sections.${visibility}.description`)}
          key={visibility}
          title={t(`memberFields.sections.${visibility}.title`)}
        >
          <TeamMemberFieldDefinitionsSectionEditor
            definitions={definitions}
            onChange={setDefinitions}
            visibility={visibility}
          />
        </SettingsFormSection>
      ))}
    </TeamGlobalSettingsLayout>
  );
}

/** @deprecated Use {@link TeamGlobalSettingsFieldsPage} */
export const TeamGlobalSettingsPage = TeamGlobalSettingsFieldsPage;
