import type { ContactRole } from "../api.js";
import { AddContactDialog } from "./add-contact-dialog.js";

interface AddPersonDialogProps {
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  open: boolean;
  t: (key: string) => string;
}

const PERSON_CONFIG = {
  entityType: "person" as const,
  titleKey: "addPerson",
  primaryFieldLabelKey: "fullName",
  buildCreateInput: (
    primaryValue: string,
    referenceId: string,
    roles: ContactRole[]
  ) => ({
    display_name: primaryValue,
    type: "person" as const,
    reference_id: referenceId,
    contact_name: primaryValue,
    ...(roles.length > 0 && { roles }),
  }),
};

export function AddPersonDialog(props: AddPersonDialogProps) {
  return <AddContactDialog {...props} config={PERSON_CONFIG} />;
}
