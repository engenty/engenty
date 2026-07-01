import { useRegisterAgentUiSlice } from "@engenty/app-shell";
import { useMemo } from "react";
import {
  buildContactSnapshotForAgentUi,
  type ContactCopilotEntity,
} from "../copilot-context.js";

export function useContactsDetailAgentUiSlice(
  entity: ContactCopilotEntity | null
) {
  const slice = useMemo(() => {
    if (!entity) {
      return null;
    }
    const title =
      entity.display_name?.trim() || entity.legal_name?.trim() || "Contact";
    return {
      page: {
        contact_snapshot: buildContactSnapshotForAgentUi(entity),
        entity_title: title,
      },
      selection: {
        entity_id: entity.id,
        entity_type: "contact",
      },
    };
  }, [entity]);

  useRegisterAgentUiSlice("contacts_detail", slice);
}
