/**
 * Task status accent colors (Tailwind `bg-*` tokens in UI).
 * Order is row-major for the settings popover (4×4 grid).
 */
export const TASK_STATUS_COLOR_OPTIONS = [
  "slate",
  "zinc",
  "blue",
  "indigo",
  "cyan",
  "teal",
  "green",
  "lime",
  "yellow",
  "amber",
  "orange",
  "red",
  "rose",
  "pink",
  "purple",
  "violet",
] as const;

export type TaskStatusColor = (typeof TASK_STATUS_COLOR_OPTIONS)[number];
