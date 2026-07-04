import { useTranslation } from "@engenty/i18n/ui";
import { Button, Card, CardContent } from "@engenty/ui-core";
import { FolderOpen, Plus } from "lucide-react";

interface OfferLinkedProjectProps {
  busy?: boolean;
  canCreate: boolean;
  onCreateProject: () => void;
  onOpenProject: () => void;
  projectId: string | null;
}

export function OfferLinkedProject({
  busy,
  canCreate,
  onCreateProject,
  onOpenProject,
  projectId,
}: OfferLinkedProjectProps) {
  const { t } = useTranslation("offers");
  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <h2 className="font-semibold text-lg">{t("linkedProject")}</h2>
        {projectId ? (
          <Button
            className="w-full justify-start"
            onClick={onOpenProject}
            variant="outline"
          >
            <FolderOpen className="mr-2 h-4 w-4" />
            {t("openProject")}
          </Button>
        ) : (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <p className="text-muted-foreground text-sm">
              {t("noProjectLinked")}
            </p>
            {canCreate ? (
              <Button disabled={busy} onClick={onCreateProject}>
                <Plus className="mr-1.5 h-4 w-4" />
                {t("createProject")}
              </Button>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
