import {
  useCompanyProfileSettingsQuery,
  useSetCompanyProfileSettingsMutation,
  useUploadCompanyLogoMutation,
} from "@engenty/company-profile/ui";
import { useTranslation } from "@engenty/i18n/ui";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Card,
  CardContent,
  EditableText,
  Skeleton,
} from "@engenty/ui-core";
import { CameraIcon, Loader2Icon } from "lucide-react";
import { useRef } from "react";
import { toast } from "sonner";

export function GeneralTenantSettingsSection() {
  const { t } = useTranslation("common");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const query = useCompanyProfileSettingsQuery();
  const saveMutation = useSetCompanyProfileSettingsMutation();
  const uploadLogoMutation = useUploadCompanyLogoMutation();

  const loading = query.isLoading;
  const uploadingLogo = uploadLogoMutation.isPending;
  const saving = saveMutation.isPending;

  const settings = query.data;
  const brandName = settings?.brand_name || settings?.name || "Engenty";
  const logoUrl = settings?.logo_url;

  const handleNameSave = async (newName: string) => {
    if (newName === brandName) {
      return;
    }
    try {
      await saveMutation.mutateAsync({ ...settings, brand_name: newName });
      toast.success(t("settings.general.nameUpdated"));
    } catch {
      toast.error(t("settings.general.nameUpdateFailed"));
    }
  };

  const handleLogoClick = () => {
    fileInputRef.current?.click();
  };

  const handleLogoUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const { logo_url } = await uploadLogoMutation.mutateAsync(file);
      await saveMutation.mutateAsync({ ...settings, logo_url });
      toast.success(t("settings.general.logoUpdated"));
    } catch {
      toast.error(t("settings.general.logoUpdateFailed"));
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  if (loading) {
    return (
      <Card className="flex flex-col items-center justify-center border-none bg-transparent pt-8 shadow-none sm:pt-12">
        <CardContent className="flex w-full flex-col items-center gap-6 p-0 text-center">
          <Skeleton className="size-20 rounded-full sm:size-24" />
          <div className="flex flex-col items-center gap-2">
            <Skeleton className="h-10 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col items-center justify-center border-none bg-transparent pt-2 shadow-none sm:pt-4">
      <CardContent className="flex w-full flex-col items-center gap-4 p-0 text-center">
        {/* Logo with clean interaction and precise spacing */}
        <div className="group relative">
          <Avatar className="size-20 bg-background p-2 ring-1 ring-border sm:size-24">
            <AvatarImage className="object-contain" src={logoUrl || ""} />
            <AvatarFallback className="bg-gradient-to-br from-primary/10 to-primary/5 font-bold text-3xl text-primary tracking-tight sm:text-4xl">
              {brandName.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>

          {/* Edit Overlay */}
          <button
            className="absolute inset-0 flex flex-col items-center justify-center rounded-full bg-black/40 opacity-0 transition-opacity disabled:opacity-50 group-hover:opacity-100"
            disabled={uploadingLogo || saving}
            onClick={handleLogoClick}
            type="button"
          >
            {uploadingLogo || saving ? (
              <Loader2Icon className="size-5 animate-spin text-white" />
            ) : (
              <>
                <CameraIcon className="mb-0.5 size-5 text-white" />
                <span className="font-bold text-[10px] text-white uppercase tracking-[0.1em]">
                  {t("actions.edit")}
                </span>
              </>
            )}
          </button>

          <input
            accept="image/*"
            className="hidden"
            onChange={handleLogoUpload}
            ref={fileInputRef}
            type="file"
          />
        </div>

        {/* Workspace Name & URL with refined typography */}
        <div className="flex flex-col items-center">
          <EditableText
            as="h1"
            className="px-4 py-1 font-bold text-3xl text-foreground tracking-[-0.03em] sm:text-4xl"
            onSave={handleNameSave}
            placeholder={t("settings.workspaceName")}
            value={brandName}
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
