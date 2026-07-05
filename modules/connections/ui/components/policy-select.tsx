import { useTranslation } from "@engenty/i18n/ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@engenty/ui-core";
import type { ConnectionPolicy } from "../api.js";

const POLICY_VALUES: ConnectionPolicy[] = ["allow", "ask", "deny"];

export interface PolicySelectProps {
  disabled?: boolean;
  onValueChange: (policy: ConnectionPolicy) => void;
  value: ConnectionPolicy;
}

/** Three-state allow / ask / deny control. */
export function PolicySelect({
  disabled,
  onValueChange,
  value,
}: PolicySelectProps) {
  const { t } = useTranslation("connections");
  return (
    <Select
      disabled={disabled}
      onValueChange={(v) => onValueChange(v as ConnectionPolicy)}
      value={value}
    >
      <SelectTrigger className="w-[150px]" size="sm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {POLICY_VALUES.map((policy) => (
          <SelectItem key={policy} value={policy}>
            {t(`policy.${policy}`)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
