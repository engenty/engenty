import { request } from "./http";

export interface AutomationRule {
  created_at: string;
  effect_id: string;
  effect_input_json: Record<string, unknown> | null;
  effect_type: "action" | "agent";
  enabled: boolean;
  filter_json: Record<string, unknown>;
  hook_id: string;
  id: string;
  tenant_id: string;
  updated_at: string;
}

function base(tenantId: string) {
  return `/api/superadmin/tenants/${encodeURIComponent(tenantId)}/automation-rules`;
}

export function listAutomationRules(tenantId: string, signal?: AbortSignal) {
  return request<AutomationRule[]>(base(tenantId), { signal });
}

export function setAutomationRuleEnabled(
  tenantId: string,
  ruleId: string,
  enabled: boolean
) {
  return request<AutomationRule>(
    `${base(tenantId)}/${encodeURIComponent(ruleId)}`,
    { method: "PATCH", body: { enabled } }
  );
}

export function deleteAutomationRule(tenantId: string, ruleId: string) {
  return request<{ deleted: boolean }>(
    `${base(tenantId)}/${encodeURIComponent(ruleId)}`,
    { method: "DELETE" }
  );
}
