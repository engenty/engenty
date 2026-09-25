/**
 * The company's files, as every Space sees them under `/company`: the company
 * drive and each Space's public folder. Agents read the same folders
 * read-only; people add to them here.
 */
import { useTranslation } from "@engenty/i18n/ui";
import { useMutation, useQuery, useQueryClient } from "@engenty/query-client";
import { Button, Spinner } from "@engenty/ui-core";
import { usePageConfig, useWorkspaceContext } from "@engenty/ui-plugin-sdk";
import { Download, FileText, Trash2, Upload } from "lucide-react";
import { useRef } from "react";
import { toast } from "sonner";
import {
  COMPANY_FILES_PREFIX,
  type CompanyFile,
  deleteCompanyFile,
  getCompanyView,
  listCompanyFiles,
  openCompanyFile,
  spacePublicPrefix,
  uploadCompanyFile,
} from "@/lib/api/company-files-client";
import { useSpacesQuery } from "@/lib/spaces-queries";

const companyKeys = {
  files: (prefix: string) => ["company", "files", prefix] as const,
  view: () => ["company", "view"] as const,
};

function formatSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FolderCard({
  canWrite,
  mountPath,
  prefix,
  title,
}: {
  canWrite: boolean;
  /** Where agents see this folder, e.g. `/company/files`. */
  mountPath: string;
  prefix: string;
  title: string;
}) {
  const { t } = useTranslation("common");
  const { currentTenant } = useWorkspaceContext();
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const files = useQuery({
    queryFn: ({ signal }) => listCompanyFiles(prefix, signal),
    queryKey: companyKeys.files(prefix),
  });
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: companyKeys.files(prefix) });
  const upload = useMutation({
    mutationFn: async (list: FileList) => {
      if (!currentTenant) {
        throw new Error("No tenant");
      }
      for (const file of Array.from(list)) {
        await uploadCompanyFile({ file, prefix, tenantId: currentTenant.id });
      }
    },
    onError: () => toast.error(t("company.uploadFailed")),
    onSettled: refresh,
  });
  const remove = useMutation({
    mutationFn: (file: CompanyFile) => deleteCompanyFile(file.key),
    onError: () => toast.error(t("company.deleteFailed")),
    onSettled: refresh,
  });
  const fullPrefix = currentTenant
    ? `tenants/${currentTenant.id}/${prefix}`
    : "";
  const rows = files.data ?? [];

  return (
    <section className="ui-card-panel overflow-hidden">
      <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate font-medium text-sm">{title}</h2>
          <p className="truncate font-mono text-muted-foreground text-xs">
            {mountPath}
          </p>
        </div>
        {canWrite ? (
          <>
            <input
              className="hidden"
              multiple
              onChange={(event) => {
                if (event.target.files?.length) {
                  upload.mutate(event.target.files);
                }
                event.target.value = "";
              }}
              ref={input}
              type="file"
            />
            <Button
              disabled={upload.isPending}
              onClick={() => input.current?.click()}
              size="sm"
              variant="outline"
            >
              <Upload className="mr-1.5 size-3.5" />
              {t("company.upload")}
            </Button>
          </>
        ) : null}
      </header>
      {files.isPending ? (
        <div className="flex items-center gap-2 p-4 text-muted-foreground text-sm">
          <Spinner className="size-4" />
        </div>
      ) : rows.length === 0 ? (
        <p className="p-4 text-muted-foreground text-sm">
          {t("company.empty")}
        </p>
      ) : (
        rows.map((file) => {
          const relative =
            fullPrefix && file.key.startsWith(fullPrefix)
              ? file.key.slice(fullPrefix.length)
              : file.filename;
          return (
            <div
              className="flex items-center gap-3 border-b px-4 py-2 last:border-b-0"
              key={file.key}
            >
              <FileText className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-sm">
                {relative}
              </span>
              <span className="shrink-0 text-muted-foreground text-xs">
                {formatSize(file.size_bytes)}
              </span>
              <Button
                aria-label={t("company.download")}
                onClick={() => {
                  openCompanyFile(file.key).catch(() =>
                    toast.error(t("company.downloadFailed"))
                  );
                }}
                size="icon"
                variant="ghost"
              >
                <Download className="size-3.5" />
              </Button>
              {canWrite ? (
                <Button
                  aria-label={t("company.delete")}
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(file)}
                  size="icon"
                  variant="ghost"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              ) : null}
            </div>
          );
        })
      )}
    </section>
  );
}

export function CompanyFilesPage() {
  const { t } = useTranslation("common");
  const view = useQuery({
    queryFn: ({ signal }) => getCompanyView(signal),
    queryKey: companyKeys.view(),
  });
  // The spaces this person can enter — the ones whose public folder they may
  // write. Same list the rail shows; core enforces the rule regardless.
  const mySpaces = useSpacesQuery();
  const enterable = new Set((mySpaces.data ?? []).map((space) => space.id));

  usePageConfig({
    breadcrumbs: [{ label: t("company.title") }],
    contentStackBackground: "paper",
  });

  if (view.isPending) {
    return (
      <div className="flex items-center gap-2 p-4 text-muted-foreground text-sm">
        <Spinner className="size-4" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        {t("company.description")}
      </p>
      <FolderCard
        canWrite={view.data?.can_manage_files === true}
        mountPath="/company/files"
        prefix={COMPANY_FILES_PREFIX}
        title={t("company.driveTitle")}
      />
      <h2 className="pt-2 font-medium text-sm">{t("company.spacesTitle")}</h2>
      {(view.data?.spaces ?? []).length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("company.noSpaces")}</p>
      ) : (
        (view.data?.spaces ?? []).map((space) => (
          <FolderCard
            canWrite={enterable.has(space.id)}
            key={space.id}
            mountPath={`/company/spaces/${space.key}`}
            prefix={spacePublicPrefix(space.id)}
            title={space.name}
          />
        ))
      )}
    </div>
  );
}
