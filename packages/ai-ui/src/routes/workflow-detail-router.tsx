// `/admin/engenty/workflows/:workflowId` — one address for one concept.
//
// A Workflow is the runnable: it holds the input parameters and is what a
// button, a slash command, a routine or an agent calls. Its STEPS are either
// one agent turn or a whole graph — that is a shape, not a second species, so
// it does not get a second URL space.
//
// Two id shapes reach this route because a runnable can exist in two states:
//   · a declared module workflow nobody has run yet — id is its declared id
//     (`contacts.enhance-contact`), and its file is what there is to show;
//   · anything with a stored graph — id is the graph's uuid, and its steps
//     are what there is to show.
// Dispatching here keeps that an implementation detail of the catalog rather
// than something a person has to know before clicking.
import { useParams } from "react-router-dom";
import { WorkflowGraphDetailPage } from "./workflow-detail-page.js";
import { WorkflowModuleDetailPage } from "./workflow-module-detail-page.js";

/** A stored graph id. Declared module-workflow ids are dotted, never uuids. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function WorkflowDetailRouter() {
  const { workflowId = "" } = useParams<{ workflowId?: string }>();
  return UUID.test(workflowId) ? (
    <WorkflowGraphDetailPage />
  ) : (
    <WorkflowModuleDetailPage />
  );
}
