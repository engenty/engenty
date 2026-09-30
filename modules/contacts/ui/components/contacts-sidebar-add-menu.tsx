import { shellSecondaryNavItemProps } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import { useQueryClient } from "@engenty/query-client";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@engenty/ui-core";
import { Building2, Plus, Upload, User } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { contactKeys } from "../query-keys.js";
import { AddOrganisationDialog } from "./add-organisation-dialog.js";
import { AddPersonDialog } from "./add-person-dialog.js";

/** The sidebar's "+": the same choices as the list page's Add menu. */
export function ContactsSidebarAddMenu() {
  const { t } = useTranslation("contacts");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState<"organisation" | "person" | null>(null);
  const onSuccess = () => {
    void queryClient.invalidateQueries({ queryKey: contactKeys.all });
  };
  const setDialogOpen = (kind: "organisation" | "person") => (next: boolean) =>
    setOpen(next ? kind : null);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={t("addEntity")}
            className="size-8 shrink-0 border-0 p-0 shadow-none"
            title={t("addEntity")}
            type="button"
            variant="ghost"
            {...shellSecondaryNavItemProps}
          >
            <Plus aria-hidden className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setOpen("organisation")}>
            <Building2 className="mr-2 h-4 w-4" />
            {t("addOrganisation")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setOpen("person")}>
            <User className="mr-2 h-4 w-4" />
            {t("addPerson")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate("/mdl/contacts/import")}>
            <Upload className="mr-2 h-4 w-4" />
            {t("import.label")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AddOrganisationDialog
        onOpenChange={setDialogOpen("organisation")}
        onSuccess={onSuccess}
        open={open === "organisation"}
        t={t}
      />
      <AddPersonDialog
        onOpenChange={setDialogOpen("person")}
        onSuccess={onSuccess}
        open={open === "person"}
        t={t}
      />
    </>
  );
}
