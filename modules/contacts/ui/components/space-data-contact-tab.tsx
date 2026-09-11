/**
 * The contact's own page, contributed to the space Data pane.
 *
 * A binding, not a second viewer: the pane shows what `/mdl/contacts/:id`
 * shows, minus the header and tab strip the host already provides. A reader
 * who edits a contact here and in the module must not be editing two different
 * things.
 *
 * `recordId` — never the path — is what identifies the record: the node's name
 * carries the id precisely so resolving one costs no scan.
 */
import type { UiTabRenderProps } from "@engenty/ui-plugin-sdk";
import { ContactDetailPage } from "../pages/contact-detail-page.js";

export function SpaceDataContactTab({ params }: UiTabRenderProps) {
  const recordId = typeof params.recordId === "string" ? params.recordId : "";
  if (!recordId) {
    return null;
  }
  return <ContactDetailPage contactId={recordId} embedded />;
}
