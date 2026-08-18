import { DetailPageHeader, Skeleton } from "@engenty/ui-core";

/**
 * Loading placeholder for the project detail page — mirrors
 * `ProjectDetailHeader` + the planning tab’s reading column so the layout
 * doesn’t jump when data arrives.
 */
export function ProjectDetailSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className="flex h-full flex-col overflow-hidden"
      data-engenty-region="detail"
    >
      <DetailPageHeader
        belowStrip={
          <div className="flex items-center gap-4 pb-2">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-14" />
            <Skeleton className="h-4 w-12" />
          </div>
        }
        eyebrow={<Skeleton className="h-3.5 w-28" />}
        maxWidth="6xl"
        title={<Skeleton className="h-8 w-64 max-w-full" />}
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl space-y-6 px-page pt-2 pb-24 sm:pt-4 md:pt-5">
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-[92%]" />
            <Skeleton className="h-4 w-[78%]" />
          </div>

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:items-start">
            <div className="space-y-3">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-10 w-full rounded-lg" />
              <Skeleton className="h-10 w-full rounded-lg" />
            </div>
            <div className="space-y-3">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-36" />
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between gap-2">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-8 w-8 rounded-md" />
            </div>
            <Skeleton className="h-14 w-full rounded-lg" />
            <Skeleton className="h-14 w-full rounded-lg" />
            <Skeleton className="h-14 w-[75%] rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  );
}
