import { Skeleton } from "@engenty/ui-core";
import { addDays, startOfWeek } from "date-fns";
import { Fragment } from "react";

interface TableSkeletonProps {
  currentWeek: Date;
}

export function TableSkeleton({ currentWeek }: TableSkeletonProps) {
  const weekStart = startOfWeek(currentWeek, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <>
      {Array.from({ length: 3 }).map((_, groupIndex) => (
        <Fragment key={`skeleton-group-${groupIndex}`}>
          <tr className="border-t-2 border-t-border bg-muted/50">
            <td className="px-2 py-2" colSpan={9}>
              <Skeleton className="h-5 w-64" />
            </td>
          </tr>
          {Array.from({ length: 2 }).map((_, rowIndex) => (
            <tr
              className="border-b"
              key={`skeleton-row-${groupIndex}-${rowIndex}`}
            >
              <td className="px-0.5 py-1">
                <Skeleton className="h-4 w-32" />
              </td>
              {weekDays.map((day) => (
                <td className="px-0.5 py-1 text-center" key={day.toISOString()}>
                  <Skeleton className="h-7 w-full" />
                </td>
              ))}
              <td className="px-0.5 py-1 text-center">
                <Skeleton className="mx-auto h-4 w-12" />
              </td>
            </tr>
          ))}
        </Fragment>
      ))}
    </>
  );
}
