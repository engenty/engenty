import { useTranslation } from "@engenty/i18n/ui";
import { Button } from "@engenty/ui-core";
import { Upload, Users } from "lucide-react";
import { Link } from "react-router-dom";

export function ContactsShortcutsWidget() {
  const { t } = useTranslation("contacts");

  return (
    <div className="grid gap-1.5">
      <Button asChild className="justify-between" variant="outline">
        <Link to="/mdl/contacts">
          <span className="flex items-center gap-2">
            <Users className="size-4" />
            {t("menu.contacts")}
          </span>
        </Link>
      </Button>
      <Button asChild className="justify-between" variant="outline">
        <Link to="/mdl/contacts/import">
          <span className="flex items-center gap-2">
            <Upload className="size-4" />
            {t("import.label")}
          </span>
        </Link>
      </Button>
    </div>
  );
}
