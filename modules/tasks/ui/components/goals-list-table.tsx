import { useTranslation } from "@engenty/i18n/ui";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  cn,
  DropdownMenuItem,
  DropdownMenuSeparator,
  STICKY_HEADER_CLASS,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableRowActions,
} from "@engenty/ui-core";
import { Pencil, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { Goal } from "../../src/schema/types.js";
import { GoalStatusBadge } from "./goal-status-badge.js";
import type {
  GoalsColumnVisibility,
  TableSize,
} from "./goals-display-dialog.js";

interface GoalsListTableProps {
  columnOrder: (keyof GoalsColumnVisibility)[];
  columnVisibility: GoalsColumnVisibility;
  goals: Goal[];
  onDelete: (goalId: string) => Promise<void>;
  onEdit: (goal: Goal) => void;
  onRowClick: (goal: Goal) => void;
  tableSize?: TableSize;
}

const COLUMN_HEADERS: Record<keyof GoalsColumnVisibility, string> = {
  title: "form.title",
  status: "form.status",
  tasks: "goals.tasksColumn",
  targetDate: "goals.targetDate",
  updatedAt: "goals.detail.updated",
};

const COLUMN_WIDTH_CLASS: Partial<Record<keyof GoalsColumnVisibility, string>> =
  {
    title: "min-w-0",
    status: "w-[1%] max-w-36 whitespace-nowrap",
    tasks: "w-[120px]",
    targetDate: "w-[120px]",
    updatedAt: "w-[120px]",
  };

function formatDate(value: string | null): string {
  if (!value) {
    return "—";
  }
  return new Date(value).toLocaleDateString();
}

function renderCell(
  key: keyof GoalsColumnVisibility,
  goal: Goal,
  t: (key: string, options?: Record<string, unknown>) => string
) {
  switch (key) {
    case "title":
      return (
        <TableCell
          className={cn("font-medium", COLUMN_WIDTH_CLASS.title)}
          key={key}
        >
          {goal.title}
        </TableCell>
      );
    case "status":
      return (
        <TableCell className={COLUMN_WIDTH_CLASS.status} key={key}>
          <GoalStatusBadge compact status={goal.status} />
        </TableCell>
      );
    case "tasks":
      return (
        <TableCell
          className={cn(
            "text-muted-foreground text-sm",
            COLUMN_WIDTH_CLASS.tasks
          )}
          key={key}
        >
          {t("goals.linkedTasks", {
            count: goal.linked_task_count ?? 0,
          })}
        </TableCell>
      );
    case "targetDate":
      return (
        <TableCell
          className={cn(
            "text-muted-foreground text-sm",
            COLUMN_WIDTH_CLASS.targetDate
          )}
          key={key}
        >
          {formatDate(goal.target_date)}
        </TableCell>
      );
    case "updatedAt":
      return (
        <TableCell
          className={cn(
            "text-muted-foreground text-sm",
            COLUMN_WIDTH_CLASS.updatedAt
          )}
          key={key}
        >
          {formatDate(goal.updated_at)}
        </TableCell>
      );
    default:
      return null;
  }
}

export function GoalsListTable({
  goals,
  columnOrder,
  columnVisibility,
  onRowClick,
  onEdit,
  onDelete,
  tableSize = "normal",
}: GoalsListTableProps) {
  const { t } = useTranslation("tasks");
  const [deletingGoal, setDeletingGoal] = useState<Goal | null>(null);
  const [deleting, setDeleting] = useState(false);

  const visibleColumns = useMemo(
    () => columnOrder.filter((key) => columnVisibility[key]),
    [columnOrder, columnVisibility]
  );

  const handleDelete = async () => {
    if (!deletingGoal) {
      return;
    }
    setDeleting(true);
    try {
      await onDelete(deletingGoal.id);
      setDeletingGoal(null);
    } finally {
      setDeleting(false);
    }
  };

  if (visibleColumns.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        {t("goals.noColumnsDisplayed")}
      </p>
    );
  }

  return (
    <>
      <Table noWrapper>
        <TableHeader className={STICKY_HEADER_CLASS}>
          <TableRow className="group [&>th]:!py-3 border-b-0 hover:bg-transparent">
            {visibleColumns.map((key) => (
              <TableHead className={COLUMN_WIDTH_CLASS[key]} key={key}>
                {t(COLUMN_HEADERS[key])}
              </TableHead>
            ))}
            <TableHead className="w-[40px] px-1" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {goals.map((goal) => (
            <TableRow
              className={cn(
                "group cursor-pointer",
                tableSize === "compact" ? "[&>td]:!py-2" : "[&>td]:!py-3"
              )}
              key={goal.id}
              onClick={() => onRowClick(goal)}
            >
              {visibleColumns.map((key) => renderCell(key, goal, t))}
              <TableRowActions>
                <DropdownMenuItem
                  onClick={(event) => {
                    event.stopPropagation();
                    onEdit(goal);
                  }}
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  {t("goals.edit.action")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={(event) => {
                    event.stopPropagation();
                    setDeletingGoal(goal);
                  }}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  {t("goals.delete.action")}
                </DropdownMenuItem>
              </TableRowActions>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <AlertDialog
        onOpenChange={(open) => !open && setDeletingGoal(null)}
        open={deletingGoal !== null}
      >
        <AlertDialogContent onClick={(event) => event.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("goals.delete.confirmTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("goals.delete.confirmDescription", {
                title: deletingGoal?.title ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>
              {t("goals.edit.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleting}
              onClick={() => void handleDelete()}
            >
              {t("goals.delete.action")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
