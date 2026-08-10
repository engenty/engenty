import type { ContactRole } from "../api.js";
import { AddContactDialog } from "./add-contact-dialog.js";

interface AddOrganisationDialogProps {
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  open: boolean;
  t: (key: string) => string;
}

const ORGANISATION_CONFIG = {
  entityType: "organisation" as const,
  titleKey: "addOrganisation",
  primaryFieldLabelKey: "legalName",
  buildCreateInput: (
    primaryValue: string,
    referenceId: string,
    roles: ContactRole[]
  ) => ({
    display_name: primaryValue,
    type: "organisation" as const,
    reference_id: referenceId,
    legal_name: primaryValue || null,
    contact_name: primaryValue,
    ...(roles.length > 0 && { roles }),
  }),
};

export function AddOrganisationDialog(props: AddOrganisationDialogProps) {
  return <AddContactDialog {...props} config={ORGANISATION_CONFIG} />;
}
