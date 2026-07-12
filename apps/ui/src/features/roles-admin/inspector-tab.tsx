// Inspector tab: pick a user or agent and see their resolved grants (base role
// + assignments → capability union), plus a "can they do X?" tester that runs
// the SAME capabilityCovers matcher the server enforces, so the answer can't
// drift from evaluatePolicy's capability step.

import { useQuery } from "@engenty/query-client";
import {
  Badge,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SettingsFormRow,
  SettingsFormSection,
} from "@engenty/ui-core";
import { useMemo, useState } from "react";
import {
  capabilityCovers,
  getEffectiveGrants,
  listCapabilities,
  listTenantUsers,
  type SubjectKind,
} from "@/lib/authz-admin-api";

interface Props {
  tenantId: string;
}

export function InspectorTab({ tenantId }: Props) {
  const usersQuery = useQuery({
    queryKey: ["authz-admin", "tenant-users"],
    queryFn: listTenantUsers,
  });
  const capsQuery = useQuery({
    queryKey: ["authz-admin", "capabilities"],
    queryFn: listCapabilities,
  });

  const [kind, setKind] = useState<SubjectKind>("user");
  const [subjectId, setSubjectId] = useState("");
  const [probe, setProbe] = useState("");

  const grantsQuery = useQuery({
    queryKey: ["authz-admin", "effective-grants", kind, subjectId],
    queryFn: () => getEffectiveGrants(tenantId, kind, subjectId.trim()),
    enabled: subjectId.trim().length > 0,
  });

  const capabilities = grantsQuery.data?.capabilities ?? [];
  const covered = useMemo(
    () => (probe.trim() ? capabilityCovers(capabilities, probe.trim()) : null),
    [capabilities, probe]
  );

  return (
    <div className="space-y-6">
      <SettingsFormSection
        description="Resolve a subject's effective grants — base role plus assignments — and test a capability."
        title="Effective grants inspector"
      >
        <SettingsFormRow label="Subject type">
          <Select
            onValueChange={(v) => {
              setKind(v as SubjectKind);
              setSubjectId("");
            }}
            value={kind}
          >
            <SelectTrigger className="ui-canvas-field h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="user">User</SelectItem>
              <SelectItem value="agent">Agent</SelectItem>
            </SelectContent>
          </Select>
        </SettingsFormRow>
        <SettingsFormRow label={kind === "user" ? "User" : "Agent id"}>
          {kind === "user" ? (
            <Select onValueChange={setSubjectId} value={subjectId}>
              <SelectTrigger className="ui-canvas-field h-8">
                <SelectValue placeholder="Select a user" />
              </SelectTrigger>
              <SelectContent>
                {(usersQuery.data ?? []).map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.display_name || u.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              className="ui-canvas-field h-8"
              onChange={(e) => setSubjectId(e.target.value)}
              placeholder="agent uuid"
              value={subjectId}
            />
          )}
        </SettingsFormRow>
      </SettingsFormSection>

      {subjectId.trim() && (
        <SettingsFormSection
          description="Base role + assignments resolved to the capability union. The tester uses the same matcher as server enforcement."
          title="Resolved grants"
        >
          <div className="space-y-1.5">
            <span className="text-[11px] text-muted-foreground uppercase tracking-wide">
              Role profiles
            </span>
            <div className="flex flex-wrap gap-1">
              {(grantsQuery.data?.roleProfiles ?? []).map((r) => (
                <Badge key={r} variant="outline">
                  {r}
                </Badge>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <span className="text-[11px] text-muted-foreground uppercase tracking-wide">
              Capabilities ({capabilities.length})
            </span>
            <div className="flex flex-wrap gap-1">
              {capabilities.map((c) => (
                <code
                  className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground"
                  key={c}
                >
                  {c}
                </code>
              ))}
            </div>
          </div>

          <div className="space-y-1.5 border-border/60 border-t pt-3">
            <Label className="text-sm" htmlFor="probe">
              Can they do…?
            </Label>
            <div className="flex items-center gap-2">
              <Input
                className="ui-canvas-field h-8 max-w-sm"
                id="probe"
                list="cap-options"
                onChange={(e) => setProbe(e.target.value)}
                placeholder="module.invoices.write"
                value={probe}
              />
              <datalist id="cap-options">
                {(capsQuery.data ?? []).map((c) => (
                  <option key={c.capability} value={c.capability} />
                ))}
              </datalist>
              {covered !== null && (
                <Badge variant={covered ? "secondary" : "destructive"}>
                  {covered ? "Allowed" : "Denied"}
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground text-xs">
              Capability check only — profile-policy conditions (project
              visibility, ownership, agent approval) may add further
              restrictions at call time.
            </p>
          </div>
        </SettingsFormSection>
      )}
    </div>
  );
}
