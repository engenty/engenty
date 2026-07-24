// Read-only routine memory surface — entity scope `tasks.routine:<trigger_id>`.
import { requestApiJson } from "@engenty/api-client";
import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import { ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { routineEntityRef } from "../../src/lib/routine-ref.js";

interface MemoryRow {
  slug?: string;
  status?: string;
  title?: string;
}

async function listRoutineMemories(
  triggerId: string,
  signal?: AbortSignal
): Promise<MemoryRow[]> {
  const result = await requestApiJson<{ rows?: MemoryRow[] }>(
    "/api/operations/memory_record_list/invoke",
    {
      body: {
        input: {
          limit: 20,
          scope_kind: "entity",
          scope_ref: routineEntityRef(triggerId),
          status: "active",
        },
      },
      method: "POST",
      signal,
    }
  );
  return result.rows ?? [];
}

export function RoutineMemorySection({ triggerId }: { triggerId: string }) {
  const { t } = useTranslation("tasks");
  const query = useQuery({
    queryKey: ["tasks", "routine-memory", triggerId],
    queryFn: ({ signal }) => listRoutineMemories(triggerId, signal),
  });

  const rows = query.data ?? [];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h4 className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
          {t("routines.detail.memory")}
        </h4>
        <Link
          className="inline-flex items-center gap-1 text-primary text-xs hover:underline"
          to="/settings/memory"
        >
          {t("routines.detail.memoryOpen")}
          <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
      <p className="text-muted-foreground text-xs">
        {t("routines.detail.memoryReflectionOff")}
      </p>
      {query.isPending ? (
        <p className="text-muted-foreground text-xs">…</p>
      ) : query.isError ? (
        <p className="text-destructive text-xs">
          {t("routines.detail.memoryLoadError")}
        </p>
      ) : rows.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          {t("routines.detail.memoryEmpty")}
        </p>
      ) : (
        <ul className="space-y-1">
          {rows.map((row) => (
            <li
              className="rounded border bg-muted/30 px-2 py-1 text-xs"
              key={row.slug ?? row.title}
            >
              {row.title || row.slug || t("routines.detail.memoryUntitled")}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
