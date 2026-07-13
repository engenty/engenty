import { useTranslation } from "@engenty/i18n/ui";
import { useMutation, useQuery, useQueryClient } from "@engenty/query-client";
import {
  AdminListTableView,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  STICKY_HEADER_CLASS,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@engenty/ui-core";
import { useState } from "react";
import { toast } from "sonner";
import { PageShell } from "@/components/PageShell";
import { PageState } from "@/components/PageState";
import type {
  Satellite,
  SatelliteHealthStatus,
  SatelliteStatus,
} from "@/lib/api/satellites";
import {
  createSatellite,
  deleteSatellite,
  probeSatelliteHealth,
} from "@/lib/api/satellites";
import { satellitesQuery } from "@/lib/queries/satellites";

type BadgeVariant = "default" | "secondary" | "outline";

const STATUS_VARIANT: Record<SatelliteStatus, BadgeVariant> = {
  active: "default",
  provisioning: "secondary",
  suspended: "outline",
  error: "outline",
  archived: "outline",
};

const HEALTH_VARIANT: Record<SatelliteHealthStatus, BadgeVariant> = {
  healthy: "default",
  unknown: "secondary",
  degraded: "outline",
  down: "outline",
};

// Reachability failures read red even though Badge has no destructive variant.
const DANGER_CLASS = "border-destructive text-destructive";

export function SatellitesListPage() {
  const { t } = useTranslation("common");
  const queryClient = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery(satellitesQuery);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [studioUrl, setStudioUrl] = useState("");
  const [apiUrl, setApiUrl] = useState("");

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["manage", "satellites"] });

  const create = useMutation({
    mutationFn: () =>
      createSatellite({
        name: name.trim(),
        endpoints: {
          ...(studioUrl.trim() ? { studioUrl: studioUrl.trim() } : {}),
          ...(apiUrl.trim() ? { apiUrl: apiUrl.trim() } : {}),
        },
      }),
    onSuccess: async () => {
      toast.success(t("satellites.created"));
      setCreateOpen(false);
      setName("");
      setStudioUrl("");
      setApiUrl("");
      await invalidate();
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("common.error")),
  });

  const probe = useMutation({
    mutationFn: (id: string) => probeSatelliteHealth(id),
    onSuccess: async (r) => {
      toast.success(t("satellites.probed", { status: r.health.status }));
      await invalidate();
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("common.error")),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteSatellite(id),
    onSuccess: async () => {
      toast.success(t("satellites.deleted"));
      await invalidate();
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("common.error")),
  });

  const satellites = (data ?? []) as Satellite[];

  return (
    <PageShell
      actions={
        <Button onClick={() => setCreateOpen(true)} size="sm">
          {t("satellites.new")}
        </Button>
      }
      breadcrumbs={[{ label: t("satellites.title") }]}
      title={t("satellites.title")}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-page">
        <p className="text-muted-foreground text-sm">
          {t("satellites.subtitle")}
        </p>
        <PageState
          error={error}
          isEmpty={satellites.length === 0}
          isLoading={isLoading}
          onRetry={() => void refetch()}
        >
          <AdminListTableView>
            <Table noWrapper>
              <TableHeader className={STICKY_HEADER_CLASS}>
                <TableRow>
                  <TableHead>{t("satellites.columns.name")}</TableHead>
                  <TableHead>{t("satellites.columns.status")}</TableHead>
                  <TableHead>{t("satellites.columns.health")}</TableHead>
                  <TableHead>{t("satellites.columns.version")}</TableHead>
                  <TableHead className="text-right">
                    {t("common.actions")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {satellites.map((sat) => (
                  <TableRow key={sat.id}>
                    <TableCell>
                      <div className="font-medium">{sat.name}</div>
                      <div className="text-muted-foreground text-xs">
                        {sat.slug}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={
                          sat.status === "error" ? DANGER_CLASS : undefined
                        }
                        variant={STATUS_VARIANT[sat.status]}
                      >
                        {t(`satellites.status.${sat.status}`)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={
                          sat.health.status === "down"
                            ? DANGER_CLASS
                            : undefined
                        }
                        variant={HEALTH_VARIANT[sat.health.status]}
                      >
                        {t(`satellites.health.${sat.health.status}`)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {sat.pinned_version ?? "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-2">
                        {sat.endpoints.studioUrl ? (
                          <a
                            className="text-primary text-sm underline"
                            href={sat.endpoints.studioUrl}
                            rel="noreferrer"
                            target="_blank"
                          >
                            {t("satellites.openStudio")}
                          </a>
                        ) : null}
                        <Button
                          disabled={probe.isPending}
                          onClick={() => probe.mutate(sat.id)}
                          size="sm"
                          variant="outline"
                        >
                          {t("satellites.probe")}
                        </Button>
                        <Button
                          disabled={remove.isPending}
                          onClick={() => remove.mutate(sat.id)}
                          size="sm"
                          variant="ghost"
                        >
                          {t("common.delete")}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </AdminListTableView>
        </PageState>
      </div>

      <Dialog onOpenChange={setCreateOpen} open={createOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("satellites.create.title")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Field
              id="sat-name"
              label={t("satellites.create.nameLabel")}
              onChange={setName}
              value={name}
            />
            <Field
              id="sat-studio"
              label={t("satellites.create.studioUrl")}
              onChange={setStudioUrl}
              placeholder="https://studio.tenant.example"
              value={studioUrl}
            />
            <Field
              id="sat-api"
              label={t("satellites.create.apiUrl")}
              onChange={setApiUrl}
              placeholder="https://tenant.example"
              value={apiUrl}
            />
          </div>
          <DialogFooter>
            <Button onClick={() => setCreateOpen(false)} variant="outline">
              {t("common.cancel")}
            </Button>
            <Button
              disabled={!name.trim() || create.isPending}
              onClick={() => create.mutate()}
            >
              {t("satellites.create.submit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="text-sm" htmlFor={id}>
        {label}
      </label>
      <Input
        id={id}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        value={value}
      />
    </div>
  );
}
