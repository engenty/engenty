import { useTranslation } from "@engenty/i18n/ui";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Card,
  CardContent,
  EditableText,
} from "@engenty/ui-core";
import { CameraIcon } from "lucide-react";
import { useState } from "react";

export function GeneralTenantSettingsSection() {
  const { t } = useTranslation("common");
  const [workspaceName, setWorkspaceName] = useState("Engenty");

  return (
    <Card className="flex flex-col items-center justify-center border-none bg-transparent pt-8 shadow-none sm:pt-12">
      <CardContent className="flex w-full flex-col items-center gap-6 p-0 text-center">
        {/* Logo with clean interaction and precise spacing */}
        <div className="group relative">
          <Avatar className="size-20 ring-1 ring-border sm:size-24">
            <AvatarImage src="" />
            <AvatarFallback className="bg-gradient-to-br from-primary/10 to-primary/5 font-bold text-3xl text-primary tracking-tight sm:text-4xl">
              {workspaceName.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>

          {/* Edit Overlay - Subtle & Refined */}
          <button
            className="absolute inset-0 flex flex-col items-center justify-center rounded-full bg-foreground/5 opacity-0 backdrop-blur-[2px] transition-all group-hover:bg-foreground/10 group-hover:opacity-100"
            type="button"
          >
            <CameraIcon className="mb-0.5 size-5 text-foreground" />
            <span className="font-bold text-[9px] text-foreground uppercase tracking-[0.1em]">
              {t("common.edit")}
            </span>
          </button>
        </div>

        {/* Workspace Name & URL with refined typography */}
        <div className="flex flex-col items-center">
          <EditableText
            as="h1"
            className="px-4 py-1 font-bold text-3xl text-foreground tracking-[-0.03em] sm:text-4xl"
            onSave={(value) => setWorkspaceName(value)}
            placeholder="Workspace Name"
            value={workspaceName}
            variant="plain"
          />
          <p className="mt-1 font-medium text-[13px] text-muted-foreground/60 tracking-tight">
            engenty.localhost
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
