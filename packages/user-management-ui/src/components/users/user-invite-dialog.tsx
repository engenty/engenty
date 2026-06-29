import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@engenty/ui-core";
import type { UseFormReturn } from "react-hook-form";

interface UserInviteDialogProps {
  form: UseFormReturn<{
    email: string;
    password: string;
    display_name: string;
    role?: "admin" | "member";
    phone?: string;
  }>;
  onOpenChange: (open: boolean) => void;
  onSubmit: () => void;
  open: boolean;
}

export function UserInviteDialog({
  open,
  onOpenChange,
  form,
  onSubmit,
}: UserInviteDialogProps) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite User</DialogTitle>
          <DialogDescription>Create a user and assign role.</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-2">
              <Label htmlFor="display_name">Name</Label>
              <Input id="display_name" {...form.register("display_name")} />
            </div>
            <div className="col-span-2 space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" {...form.register("email")} />
            </div>
            <div className="col-span-2 space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                minLength={6}
                type="password"
                {...form.register("password")}
              />
            </div>
            <div className="col-span-2 space-y-2">
              <Label htmlFor="phone">Kontakt</Label>
              <Input id="phone" {...form.register("phone")} />
            </div>
            <div className="col-span-2 space-y-2">
              <Label htmlFor="role">Zugriffsebene</Label>
              <Select
                onValueChange={(value) =>
                  form.setValue("role", value as "admin" | "member")
                }
                value={form.watch("role")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button className="w-full" type="submit">
            Create Account
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
