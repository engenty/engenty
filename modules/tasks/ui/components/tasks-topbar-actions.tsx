import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@engenty/ui-core";
import {
  ChevronDown,
  ListTodo,
  Plus,
  Settings,
  Target,
  Zap,
} from "lucide-react";

interface TasksTopbarActionsProps {
  addNewLabel: string;
  newGoalLabel: string;
  newRoutineLabel: string;
  newTaskLabel: string;
  onCreateGoal: () => void;
  onCreateRoutine: () => void;
  onCreateTask: () => void;
  onOpenSettings: () => void;
  settingsLabel: string;
}

export function TasksTopbarActions({
  addNewLabel,
  newGoalLabel,
  newRoutineLabel,
  newTaskLabel,
  onCreateGoal,
  onCreateRoutine,
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
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm">
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            {addNewLabel}
            <ChevronDown className="ml-1.5 h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={onCreateTask}>
            <ListTodo className="mr-2 h-4 w-4" />
            {newTaskLabel}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onCreateGoal}>
            <Target className="mr-2 h-4 w-4" />
            {newGoalLabel}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onCreateRoutine}>
            <Zap className="mr-2 h-4 w-4" />
            {newRoutineLabel}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
