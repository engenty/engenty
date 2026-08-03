// Capabilities tab: the capability catalog derived from registered gateway
// methods — each capability with the operations that require it, their risk
// level, and whether they force approval. Doubles as module-API documentation.

import { useQuery } from "@engenty/query-client";
import {
  Input,
  SettingsFormCard,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@engenty/ui-core";
import { useMemo, useState } from "react";
import { listCapabilities } from "@/lib/authz-admin-api";
import { Pill, riskTone } from "./pills";

export const CAPABILITIES_QUERY_KEY = ["authz-admin", "capabilities"];

export function CapabilityCatalogTab() {
  const query = useQuery({
    queryKey: CAPABILITIES_QUERY_KEY,
    queryFn: listCapabilities,
  });
  const [filter, setFilter] = useState("");

  const rows = useMemo(() => {
    const all = query.data ?? [];
    const f = filter.trim().toLowerCase();
    if (!f) {
      return all;
    }
    return all.filter(
      (c) =>
        c.capability.toLowerCase().includes(f) ||
        c.operations.some((o) => o.operationId.toLowerCase().includes(f))
    );
  }, [query.data, filter]);

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        Every capability and the operations it unlocks. Risk and approval come
        from each operation's gateway contract. A capability with no operations
        is a scoping one — it narrows what an operation may reach rather than
        granting the operation.
      </p>
      <Input
        className="ui-canvas-field h-8 w-64 text-sm"
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter capabilities / operations"
        value={filter}
      />
      <SettingsFormCard variant="flush">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-1/3">Capability</TableHead>
              <TableHead>Operations</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((entry) => (
              <TableRow className="hover:bg-transparent" key={entry.capability}>
                <TableCell className="align-top">
                  <code className="font-mono text-sm">{entry.capability}</code>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1.5">
                    {entry.operations.length === 0 && (
                      <span className="text-muted-foreground text-xs">
                        Unlocks no operation on its own — narrows which
                        resources the operations above may touch.
                      </span>
                    )}
                    {entry.operations.map((op) => (
                      <div
                        className="flex items-center justify-between gap-3"
                        key={op.operationId}
                      >
                        <code className="font-mono text-muted-foreground text-xs">
                          {op.operationId}
                        </code>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <Pill tone={riskTone(op.riskLevel)}>
                            {op.riskLevel}
                          </Pill>
                          {op.requiresApproval && (
                            <Pill tone="medium">approval</Pill>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SettingsFormCard>
    </div>
  );
}
