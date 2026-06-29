import { SettingsFormSection, Switch } from "@engenty/ui-core";
import { Check, PanelLeft, PanelLeftClose } from "lucide-react";
import { cn } from "@/lib/utils";

interface AppearanceSidebarSectionProps {
  mode: string;
  onModeChange: (id: string) => void;
  onVisibilityChange: (id: string) => void;
  visibility: string;
}

export function AppearanceSidebarSection({
  mode,
  onModeChange,
  visibility,
  onVisibilityChange,
}: AppearanceSidebarSectionProps) {
  const autoHide = visibility === "auto-hide";

  return (
    <SettingsFormSection
      description="Choose how the sidebar is displayed and whether it auto-hides."
      title="Navigation Sidebar"
    >
      <div className="space-y-6">
        {/* Sidebar Mode */}
        <div className="space-y-2">
          <span className="font-medium text-foreground text-sm">Mode</span>
          <div className="grid grid-cols-2 gap-3">
            <button
              className={cn(
                "relative flex flex-col items-center justify-center gap-1.5 rounded-lg border p-3.5 font-medium text-sm transition-colors",
                mode === "compact"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground hover:bg-accent"
              )}
              onClick={() => onModeChange("compact")}
              type="button"
            >
              <PanelLeftClose className="h-4 w-4" />
              Compact
              {mode === "compact" && (
                <div className="absolute top-1.5 right-1.5">
                  <Check className="h-3 w-3 text-primary" />
                </div>
              )}
            </button>
            <button
              className={cn(
                "relative flex flex-col items-center justify-center gap-1.5 rounded-lg border p-3.5 font-medium text-sm transition-colors",
                mode === "extended"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground hover:bg-accent"
              )}
              onClick={() => onModeChange("extended")}
              type="button"
            >
              <PanelLeft className="h-4 w-4" />
              Extended
              {mode === "extended" && (
                <div className="absolute top-1.5 right-1.5">
                  <Check className="h-3 w-3 text-primary" />
                </div>
              )}
            </button>
          </div>
        </div>

        {/* Auto-Hide Switch */}
        <div className="flex items-center justify-between rounded-lg border border-border bg-card p-3.5">
          <div className="space-y-0.5">
            <label
              className="font-medium text-foreground text-sm"
              htmlFor="sidebar-auto-hide"
            >
              Auto-Hide
            </label>
            <p className="text-muted-foreground text-xs">
              Sidebar hides automatically and appears on hover
            </p>
          </div>
          <Switch
            checked={autoHide}
            id="sidebar-auto-hide"
            onCheckedChange={(checked) =>
              onVisibilityChange(checked ? "auto-hide" : "always")
            }
          />
        </div>
      </div>
    </SettingsFormSection>
  );
}
