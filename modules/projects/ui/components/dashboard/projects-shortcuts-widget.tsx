import { useTranslation } from "@engenty/i18n/ui";
import { Button } from "@engenty/ui-core";
import { FolderKanban, Settings2 } from "lucide-react";
import { Link } from "react-router-dom";

export function ProjectsShortcutsWidget() {
  const { t } = useTranslation("projects");

  return (
    <div className="grid gap-1.5">
      <Button asChild className="justify-between" variant="outline">
        <Link to="/mdl/projects">
          <span className="flex items-center gap-2">
            <FolderKanban className="size-4" />
            {t("menu.projects")}
          </span>
        </Link>
      </Button>
      <Button asChild className="justify-between" variant="outline">
        <Link to="/mdl/projects/settings">
          <span className="flex items-center gap-2">
            <Settings2 className="size-4" />
            {t("settings.title")}
          </span>
        </Link>
      </Button>
    </div>
  );
}
