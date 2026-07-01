import { createContext, useContext } from "react";
import type {
  Discipline,
  Option,
  ProjectOption,
  TeamMemberOption,
  TimeEntry,
  TrackingRow,
} from "./types.js";

interface TimeTrackingContextValue {
  // Reference data
  allProjects: ProjectOption[];
  disciplines: Discipline[];
  // Handlers
  getEntryForRowAndDate: (
    row: TrackingRow,
    date: Date
  ) => TimeEntry | undefined;
  // Move-mode state
  moveDate: Date;
  moveDiscipline: string;
  moveMode: string | null;
  movePhase: string;
  movePhases: Option[];
  moveProject: string;
  moveProjectComboOpen: boolean;
  moveTask: string;
  moveTasks: Option[];
  moveUser: string;
  onDeleteEntry: (entryId: string) => void;
  onDeleteRow: (rowId: string) => void;
  onMoveEntry: (entry: TimeEntry) => void;
  onOpenMoveMode: (entry: TimeEntry) => void;
  onSaveEntry: (
    row: TrackingRow,
    day: Date,
    entry: TimeEntry | undefined,
    hours: number,
    notes: string | null,
    discipline: string | null
  ) => void;
  // Feature flags
  projectSelectionEnabled: boolean;
  // Move setters
  setMoveDate: (date: Date) => void;
  setMoveDiscipline: (discipline: string) => void;
  setMoveMode: (entryId: string | null) => void;
  setMovePhase: (phaseId: string) => void;
  setMoveProject: (projectId: string) => void;
  setMoveProjectComboOpen: (open: boolean) => void;
  setMoveTask: (taskId: string) => void;
  setMoveUser: (userId: string) => void;
  showUserSelect: boolean;
  users: TeamMemberOption[];
}

const TimeTrackingContext = createContext<TimeTrackingContextValue | null>(
  null
);

export function useTimeTrackingContext() {
  const ctx = useContext(TimeTrackingContext);
  if (!ctx) {
    throw new Error("useTimeTrackingContext used outside TimeTrackingProvider");
  }
  return ctx;
}

export interface TimeTrackingProviderProps extends TimeTrackingContextValue {
  children: React.ReactNode;
}

export function TimeTrackingProvider({
  children,
  ...value
}: TimeTrackingProviderProps) {
  return (
    <TimeTrackingContext.Provider value={value}>
      {children}
    </TimeTrackingContext.Provider>
  );
}
