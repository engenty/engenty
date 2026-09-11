// The approval card.
//
// The rule that matters here: show the ACTUAL EFFECT, not the intent. "Send
// invoice #2041 for €4,800 to billing@acme.com" is a decision someone can make.
// "The agent would like to send an email" is not. Everything else on this card
// is in service of that one line.
import { Badge, Button, Separator, Textarea } from "@engenty/ui-core";
import { ShieldCheck } from "lucide-react";
import { useState } from "react";

export interface GateDecisionPayload {
  context_id?: string;
  context_type?: string;
  kind?: string;
  payload?: Record<string, unknown>;
  title?: string;
}

export interface GateDecisionCardProps {
  busy?: boolean;
  gate: GateDecisionPayload;
  onDecide: (decision: {
    approved: boolean;
    data?: Record<string, unknown>;
    reason?: string;
  }) => void;
}

/** Render a payload value the way a person would read it, not JSON.stringify. */
function readableValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "—";
  }
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  if (typeof value === "boolean") {
    return value ? "yes" : "no";
  }
  return JSON.stringify(value);
}

export function GateDecisionCard({
  busy = false,
  gate,
  onDecide,
}: GateDecisionCardProps) {
  const [reason, setReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const entries = Object.entries(gate.payload ?? {});
  const isFieldUpdates = gate.kind === "field_updates";

  return (
    <div className="rounded-lg border-2 border-amber-500/60 bg-amber-500/[0.05]">
      <header className="flex items-start gap-3 px-4 py-3.5">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-amber-500/20 text-amber-700 dark:text-amber-300">
          <ShieldCheck aria-hidden className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm">
            {gate.title ?? "This run needs your decision"}
          </p>
          {gate.context_type ? (
            <p className="mt-0.5 text-muted-foreground text-xs">
              {gate.context_type}
              {gate.context_id ? ` · ${gate.context_id}` : ""}
            </p>
          ) : null}
        </div>
        {isFieldUpdates ? <Badge variant="outline">Field changes</Badge> : null}
      </header>

      {entries.length > 0 ? (
        <>
          <Separator />
          <dl className="grid grid-cols-[minmax(0,7rem)_1fr] gap-x-3 gap-y-1.5 px-4 py-3">
            {entries.map(([key, value]) => (
              <div className="contents" key={key}>
                <dt className="truncate text-muted-foreground text-xs">
                  {key.replace(/_/g, " ")}
                </dt>
                <dd className="break-words font-medium text-xs">
                  {readableValue(value)}
                </dd>
              </div>
            ))}
          </dl>
        </>
      ) : null}

      {rejecting ? (
        <div className="space-y-2 px-4 pb-3">
          <Textarea
            aria-label="Why are you rejecting this?"
            className="min-h-[64px] text-xs"
            onChange={(event) => setReason(event.target.value)}
            placeholder="Why? (optional — the run records this)"
            value={reason}
          />
        </div>
      ) : null}

      <footer className="flex items-center justify-end gap-2 border-t px-4 py-2.5">
        {rejecting ? (
          <>
            <Button
              disabled={busy}
              onClick={() => setRejecting(false)}
              size="sm"
              variant="ghost"
            >
              Back
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                onDecide({
                  approved: false,
                  ...(reason.trim() ? { reason: reason.trim() } : {}),
                })
              }
              size="sm"
              variant="destructive"
            >
              Confirm reject
            </Button>
          </>
        ) : (
          <>
            <Button
              disabled={busy}
              onClick={() => setRejecting(true)}
              size="sm"
              variant="ghost"
            >
              Reject
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                onDecide({
                  approved: true,
                  // A field-updates gate resumes with the patch it proposed;
                  // the graph's next node is what writes it.
                  ...(isFieldUpdates && gate.payload
                    ? { data: gate.payload }
                    : {}),
                })
              }
              size="sm"
            >
              Approve
            </Button>
          </>
        )}
      </footer>
    </div>
  );
}
