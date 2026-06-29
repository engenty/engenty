import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  Separator,
} from "@engenty/ui-core";
import { Pencil, Trash2 } from "lucide-react";
import type { FileStorageSkillDetail } from "../../lib/runtime/skills-api.js";

interface SkillDetailPanelProps {
  onDelete: (name: string) => void;
  onEdit: (skill: FileStorageSkillDetail) => void;
  skill: FileStorageSkillDetail;
  t: (key: string) => string;
}

export function SkillDetailPanel({
  onDelete,
  onEdit,
  skill,
  t,
}: SkillDetailPanelProps) {
  const showTitle = skill.title && skill.title !== skill.name;

  return (
    <Card className="min-h-0 overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-mono font-semibold text-base">
                {skill.name}
              </h3>
              <Badge
                variant={skill.tier === "managed" ? "secondary" : "outline"}
              >
                {skill.tier === "managed"
                  ? t("skills.tierManaged")
                  : t("skills.tierCustom")}
              </Badge>
              {skill.editable ? null : (
                <span className="text-muted-foreground text-xs">
                  {t("skills.readOnly")}
                </span>
              )}
            </div>
            {showTitle ? (
              <p className="mt-0.5 text-muted-foreground text-sm">
                {skill.title}
              </p>
            ) : null}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {skill.description ? (
          <p className="text-sm">{skill.description}</p>
        ) : null}

        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {skill.source ? (
            <span className="text-muted-foreground text-xs">
              <span className="font-medium">{t("skills.source")}:</span>{" "}
              {skill.source}
            </span>
          ) : null}
          {skill.version ? (
            <span className="text-muted-foreground text-xs">
              <span className="font-medium">{t("skills.version")}:</span>{" "}
              {skill.version}
            </span>
          ) : null}
          {skill.engenty_modules.length > 0 ? (
            <span className="text-muted-foreground text-xs">
              <span className="font-medium">{t("skills.modules")}:</span>{" "}
              {skill.engenty_modules.join(", ")}
            </span>
          ) : null}
          {skill.requires_sandbox ? (
            <span className="text-muted-foreground text-xs">
              <span className="font-medium">
                {t("skills.requiresSandbox")}:
              </span>{" "}
              yes
            </span>
          ) : null}
          {skill.tags.length > 0 ? (
            <span className="text-muted-foreground text-xs">
              <span className="font-medium">{t("skills.tags")}:</span>{" "}
              {skill.tags.join(", ")}
            </span>
          ) : null}
        </div>

        {skill.allowed_tools.length > 0 ? (
          <div>
            <p className="mb-1 font-medium text-xs">
              {t("skills.allowedTools")}
            </p>
            <p className="font-mono text-muted-foreground text-xs">
              {skill.allowed_tools.join(", ")}
            </p>
          </div>
        ) : null}

        <Separator />

        <div>
          <p className="mb-2 font-medium text-xs">{t("skills.body")}</p>
          <pre className="max-h-[40vh] overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-4 font-mono text-xs">
            {skill.body || ""}
          </pre>
        </div>

        {skill.editable ? (
          <div className="flex gap-2 pt-1">
            <Button onClick={() => onEdit(skill)} size="sm" variant="outline">
              <Pencil className="mr-1.5 h-3.5 w-3.5" />
              {t("skills.editSkill")}
            </Button>
            <Button
              onClick={() => onDelete(skill.name)}
              size="sm"
              variant="destructive"
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              {t("skills.deleteSkill")}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
