import { useUiPluginContributions } from "@/plugins/use-ui-plugin-contributions";
import { DevelopmentSessionSearchSection } from "./development-session-search-section";

export function DevelopmentSearchIndexTab() {
  const { contributions } = useUiPluginContributions({ enabled: true });

  return (
    <div className="space-y-8">
      {contributions.developmentPanels.map((panel) => {
        const Panel = panel.component;
        return <Panel key={panel.id} />;
      })}
      <DevelopmentSessionSearchSection />
    </div>
  );
}
