"use client";

// What a workflow DID: the list of its runs, and one run opened in place.
//
// Its own section rather than a tab inside the editor — the definition and its
// history are different subjects, and a version picker means nothing to a run
// that already happened.
import { useState } from "react";
import { WorkflowRunView } from "./workflow-run-view.js";
import { WorkflowRunsList } from "./workflow-runs-list.js";

export function WorkflowRunsSection({ graphId }: { graphId: string }) {
  const [openRunId, setOpenRunId] = useState<string | null>(null);
  return openRunId ? (
    <WorkflowRunView onBack={() => setOpenRunId(null)} runId={openRunId} />
  ) : (
    <WorkflowRunsList
      graphId={graphId}
      onOpen={(run) => setOpenRunId(run.run_id ?? null)}
    />
  );
}
