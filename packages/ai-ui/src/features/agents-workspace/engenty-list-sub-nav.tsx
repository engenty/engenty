// Line tabs in DetailPageHeader.aboveStrip — switch Engenty catalog hubs.
import { useTranslation } from "@engenty/i18n/ui";
import { TabsList, TabsTrigger } from "@engenty/ui-core";

export type EngentyListTab =
  | "agents"
  | "skills"
  | "flows"
  | "tools"
  | "artifacts";

export function EngentyListSubNav() {
  const { t } = useTranslation("ai-ui");

  return (
    <TabsList
      className="-mb-px h-auto border-0 bg-transparent p-0"
      variant="line"
    >
      <TabsTrigger value="agents">{t("workspace.sidebarAgents")}</TabsTrigger>
      <TabsTrigger value="skills">{t("workspace.sidebarSkills")}</TabsTrigger>
      {/* One entry for everything runnable: a module workflow compiles to a flow,
          so they are one catalog with a source filter. */}
      <TabsTrigger value="flows">{t("workspace.sidebarFlows")}</TabsTrigger>
      <TabsTrigger value="tools">{t("workspace.sidebarTools")}</TabsTrigger>
      <TabsTrigger value="artifacts">
        {t("workspace.sidebarArtifacts")}
      </TabsTrigger>
    </TabsList>
  );
}
