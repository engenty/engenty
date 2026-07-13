import { requestApiJson } from "@engenty/api-client";
import { useTranslation } from "@engenty/i18n/ui";
import { useMutation, useQuery, useQueryClient } from "@engenty/query-client";
import {
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
  cn,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@engenty/ui-core";
import { Check, HardDrive } from "lucide-react";
import { useState } from "react";
import {
  type ArtifactScopeType,
  artifactStorageBindingQueryKey,
  resolveEngentyAiServiceBaseUrlSafe,
  setArtifactStorageBinding,
  useArtifactStorageBindingQuery,
} from "./artifacts-api.js";

interface StorageTarget {
  connection_id: string;
  connector_icon: string | null;
  connector_id: string;
  connector_name: string;
  label: string;
}

// Storage-capable connections come from the connections module's gateway
// operation — same invoke path its own settings UI uses.
function useStorageTargetsQuery(enabled: boolean) {
  return useQuery({
    queryKey: ["connections", "storage-targets"],
    enabled,
    queryFn: async ({ signal }) => {
      const data = await requestApiJson<{ targets: StorageTarget[] }>(
        "/api/tools/connections_storage_targets/invoke",
        { method: "POST", body: { input: {} }, signal }
      );
      return data.targets;
    },
    staleTime: 60_000,
  });
}

/**
 * Per-scope external storage picker: choose the connection promoted artifacts
 * are mirrored to (platform storage stays the fallback and render source).
 * Rendered on stored-artifact surfaces, e.g. the project Artifacts tab.
 */
export function ArtifactStoragePicker({
  scopeId,
  scopeType,
}: {
  scopeId: string;
  scopeType: Exclude<ArtifactScopeType, "thread">;
}) {
  const { t } = useTranslation("ai-ui");
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const bindingQuery = useArtifactStorageBindingQuery(scopeType, scopeId);
  const targetsQuery = useStorageTargetsQuery(open);
  const targets = targetsQuery.data ?? [];

  const mutation = useMutation({
    mutationFn: (connectionId: string | null) =>
      setArtifactStorageBinding({
        serviceBaseUrl: resolveEngentyAiServiceBaseUrlSafe(),
        scopeType,
        scopeId,
        connectionId,
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: artifactStorageBindingQueryKey(scopeType, scopeId),
      }),
  });

  const boundConnectionId = bindingQuery.data?.connection_id ?? null;
  const boundTarget = targets.find(
    (target) => target.connection_id === boundConnectionId
  );
  const summary = boundConnectionId
    ? (boundTarget?.label ?? t("artifacts.storageConnected"))
    : t("artifacts.storagePlatform");

  const select = (connectionId: string | null) => {
    if (connectionId !== boundConnectionId) {
      mutation.mutate(connectionId);
    }
    setOpen(false);
  };

  return (
    <Popover modal={false} onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <Button
          className="h-auto gap-2 px-2 py-1 text-muted-foreground text-xs"
          disabled={bindingQuery.isLoading || mutation.isPending}
          size="sm"
          variant="ghost"
        >
          <HardDrive className="size-3.5" />
          <span className="min-w-0 truncate">
            {t("artifacts.storageLabel")}: {summary}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <Command>
          <CommandList className="max-h-56">
            <CommandEmpty>{t("artifacts.storeNoMatch")}</CommandEmpty>
            <CommandGroup heading={t("artifacts.storageHeading")}>
              <CommandItem onSelect={() => select(null)} value="__platform__">
                <Check
                  className={cn(
                    "mr-2 h-4 w-4",
                    boundConnectionId === null ? "opacity-100" : "opacity-0"
                  )}
                />
                {t("artifacts.storagePlatform")}
              </CommandItem>
              {targetsQuery.isLoading ? (
                <CommandItem disabled value="__loading__">
                  …
                </CommandItem>
              ) : targets.length === 0 ? (
                <CommandItem disabled value="__none__">
                  {t("artifacts.storageNoTargets")}
                </CommandItem>
              ) : (
                targets.map((target) => (
                  <CommandItem
                    key={target.connection_id}
                    keywords={[target.label, target.connector_name]}
                    onSelect={() => select(target.connection_id)}
                    value={`${target.label} ${target.connection_id}`}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        boundConnectionId === target.connection_id
                          ? "opacity-100"
                          : "opacity-0"
                      )}
                    />
                    <span className="min-w-0 truncate">
                      {target.connector_icon ? `${target.connector_icon} ` : ""}
                      {target.label}
                    </span>
                  </CommandItem>
                ))
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
