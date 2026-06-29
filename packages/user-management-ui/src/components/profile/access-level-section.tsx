import {
  Card,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
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
    <div className="space-y-2">
      <h2 className="font-medium text-lg">Access Level</h2>
      <Card className="rounded-sm">
        <div className="p-4">
          <div className="flex items-center gap-4">
            <Label className="w-32 text-sm" htmlFor="role">
              Role
            </Label>
            <Select
              onValueChange={(value) =>
                onRoleChange(value as "admin" | "member")
              }
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
        </div>
      </Card>
    </div>
  );
}
