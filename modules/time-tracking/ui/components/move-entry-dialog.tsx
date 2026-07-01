import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  Calendar,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@engenty/ui-core";
import { format } from "date-fns";
import { Check, ChevronsUpDown } from "lucide-react";
import { useState } from "react";
import type {
  Discipline,
  Option,
  ProjectOption,
  TeamMemberOption,
} from "./types.js";

interface MoveEntryDialogProps {
  allProjects: ProjectOption[];
  disciplines: Discipline[];
  moveDate: Date;
  moveDiscipline: string;
  movePhase: string;
  movePhases: Option[];
  moveProject: string;
  moveProjectComboOpen: boolean;
  moveTask: string;
  moveTasks: Option[];
  moveUser: string;
  onCancel: () => void;
  onMove: () => void;
  projectSelectionEnabled: boolean;
  setMoveDate: (date: Date) => void;
  setMoveDiscipline: (discipline: string) => void;
  setMovePhase: (phaseId: string) => void;
  setMoveProject: (projectId: string) => void;
  setMoveProjectComboOpen: (open: boolean) => void;
  setMoveTask: (taskId: string) => void;
  setMoveUser: (userId: string) => void;
  showUserSelect: boolean;
  users: TeamMemberOption[];
}

export function MoveEntryDialog({
  moveDate,
  setMoveDate,
  moveProject,
  setMoveProject,
  movePhase,
  setMovePhase,
  moveTask,
  setMoveTask,
  moveDiscipline,
  setMoveDiscipline,
  moveUser,
  setMoveUser,
  movePhases,
  moveTasks,
  moveProjectComboOpen,
  setMoveProjectComboOpen,
  allProjects,
  disciplines,
  users,
  showUserSelect,
  projectSelectionEnabled,
  onCancel,
  onMove,
}: MoveEntryDialogProps) {
  const { t } = useTranslation("time-tracking");
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  return (
    <div className="space-y-3">
      <h4 className="font-semibold text-sm">{t("moveEntry")}</h4>

      <div className="space-y-1.5">
        <Label className="text-xs">{t("date")}</Label>
        <Popover onOpenChange={setDatePickerOpen} open={datePickerOpen}>
          <PopoverTrigger asChild>
            <Button
              className="h-8 w-full justify-start text-left font-normal text-xs"
              variant="outline"
            >
              {format(moveDate, "PPP")}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-0">
            <Calendar
              className="min-w-[200px]"
              mode="single"
              onSelect={(date) => {
                if (date) {
                  setMoveDate(date);
                }
                setDatePickerOpen(false);
              }}
              selected={moveDate}
            />
          </PopoverContent>
        </Popover>
      </div>

      {projectSelectionEnabled ? (
        <>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("project")}</Label>
            <Popover
              onOpenChange={setMoveProjectComboOpen}
              open={moveProjectComboOpen}
            >
              <PopoverTrigger asChild>
                <Button
                  className="h-8 w-full justify-between font-normal text-xs"
                  role="combobox"
                  variant="outline"
                >
                  {moveProject
                    ? (() => {
                        const project = allProjects.find(
                          (p) => p.id === moveProject
                        );
                        return project
                          ? `${project.client_name ?? t("manual")} / ${project.title}`
                          : t("selectProject");
                      })()
                    : t("selectProject")}
                  <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-[320px] p-0">
                <Command>
                  <CommandInput
                    className="h-8 text-xs"
                    placeholder={t("searchProjects")}
                  />
                  <CommandList>
                    <CommandEmpty className="py-2 text-xs">
                      {t("noProjectFound")}
                    </CommandEmpty>
                    <CommandGroup>
                      {allProjects.map((project) => (
                        <CommandItem
                          className="text-xs"
                          key={project.id}
                          onSelect={() => {
                            setMoveProject(project.id);
                            setMoveProjectComboOpen(false);
                          }}
                          value={`${project.client_name ?? ""} ${project.title}`}
                        >
                          <Check
                            className={`mr-2 h-3 w-3 ${moveProject === project.id ? "opacity-100" : "opacity-0"}`}
                          />
                          {project.client_name ?? t("manual")} / {project.title}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {moveProject ? (
            <div className="space-y-1.5">
              <Label className="text-xs">{t("phaseOptional")}</Label>
              <Select onValueChange={setMovePhase} value={movePhase}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder={t("phaseOptional")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem className="text-xs" value="general">
                    {t("general")}
                  </SelectItem>
                  {movePhases.map((phase) => (
                    <SelectItem
                      className="text-xs"
                      key={phase.id}
                      value={phase.id}
                    >
                      {phase.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {movePhase && movePhase !== "general" && moveTasks.length > 0 ? (
            <div className="space-y-1.5">
              <Label className="text-xs">{t("taskOptional")}</Label>
              <Select onValueChange={setMoveTask} value={moveTask}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder={t("taskOptional")} />
                </SelectTrigger>
                <SelectContent>
                  {moveTasks.map((task) => (
                    <SelectItem
                      className="text-xs"
                      key={task.id}
                      value={task.id}
                    >
                      {task.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </>
      ) : null}

      <div className="space-y-1.5">
        <Label className="text-xs">{t("disciplineOptional")}</Label>
        <Select onValueChange={setMoveDiscipline} value={moveDiscipline}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder={t("disciplineOptional")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem className="text-xs" value="NONE">
              {t("none")}
            </SelectItem>
            {disciplines.map((discipline) => (
              <SelectItem
                className="text-xs"
                key={discipline.name}
                value={discipline.name}
              >
                {discipline.name} ({discipline.short})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {showUserSelect ? (
        <div className="space-y-1.5">
          <Label className="text-xs">{t("user")}</Label>
          <Select onValueChange={setMoveUser} value={moveUser}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder={t("selectUser")} />
            </SelectTrigger>
            <SelectContent>
              {users.map((user) => (
                <SelectItem className="text-xs" key={user.id} value={user.id}>
                  {user.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button
          className="h-7 text-xs"
          onClick={onCancel}
          size="sm"
          variant="outline"
        >
          {t("close")}
        </Button>
        <Button className="h-7 text-xs" onClick={onMove} size="sm">
          {t("move")}
        </Button>
      </div>
    </div>
  );
}
