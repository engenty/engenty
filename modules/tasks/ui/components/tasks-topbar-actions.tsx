import { Button } from "@engenty/ui-core";
import { Plus, Settings } from "lucide-react";

interface TasksTopbarActionsProps {
  addNewLabel: string;
  newTaskLabel: string;
  onCreateTask: () => void;
  onOpenSettings: () => void;
  settingsLabel: string;
}

export function TasksTopbarActions({
  newTaskLabel,
  onCreateTask,
  onOpenSettings,
  settingsLabel,
}: TasksTopbarActionsProps) {
  return (
    <div className="flex items-center gap-2">
      <Button
        className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
        onClick={onOpenSettings}
        size="sm"
        title={settingsLabel}
        variant="ghost"
      >
        <Settings className="h-4 w-4" />
      </Button>
      <Button onClick={onCreateTask} size="sm">
        <Plus className="mr-1.5 h-3.5 w-3.5" />
        {newTaskLabel}
      </Button>
    </div>
  );
}
