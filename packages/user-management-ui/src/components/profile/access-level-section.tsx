import {
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SettingsFormSection,
} from "@engenty/ui-core";

interface AccessLevelSectionProps {
  onRoleChange: (role: "admin" | "member") => void;
  role: "admin" | "member";
}

export function AccessLevelSection({
  role,
  onRoleChange,
}: AccessLevelSectionProps) {
  return (
    <SettingsFormSection
      cardVariant="compact"
      description="Workspace role for this user."
      title="Access Level"
    >
      <div className="flex items-center gap-4">
        <Label className="w-32 shrink-0 text-sm" htmlFor="role">
          Role
        </Label>
        <Select
          onValueChange={(value) => onRoleChange(value as "admin" | "member")}
          value={role}
        >
          <SelectTrigger className="flex-1 rounded-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="member">Member</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </SettingsFormSection>
  );
}
