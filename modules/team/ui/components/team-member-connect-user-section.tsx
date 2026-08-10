/**
 * TeamMemberConnectUserSection — compact status chip + modal to link / create /
 * unlink a user account. Works standalone (own form state + direct API call) so
 * it can appear in both the view and edit pages without coupling to the main
 * edit form.
 */
import { useQuery, useQueryClient } from "@engenty/query-client";
import {
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  cn,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  PasswordInput,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@engenty/ui-core";
import { Check, ChevronsUpDown, Link2, Link2Off, UserPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  listUsers,
  type TeamMemberListItem,
  updateTeamMember,
} from "../api.js";
import { teamMemberKeys } from "../queries.js";

const CREATE_NEW = "create_new";
const NONE = "none";

interface Props {
  /** Current member email — used as default for invite email */
  currentEmail: string | null;
  /** Current linked user id (null = not linked) */
  currentUserId: string | null;
  memberId: string;
  /** Called after a successful link / create so the parent can refetch */
  onLinked?: (member: TeamMemberListItem) => void;
  t: (key: string) => string;
}

export function TeamMemberConnectUserSection({
  memberId,
  currentUserId,
  currentEmail,
  t,
  onLinked,
}: Props) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>(NONE);
  const [email, setEmail] = useState(currentEmail ?? "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const usersQuery = useQuery({
    queryKey: ["users", "list"],
    queryFn: ({ signal }) => listUsers(signal),
    enabled: open || Boolean(currentUserId),
  });

  const users = usersQuery.data ?? [];

  const linkedUserLabel = (() => {
    if (!currentUserId) {
      return null;
    }
    const u = users.find((u) => u.id === currentUserId);
    return u
      ? `${u.display_name || u.email} (${u.email})`
      : `${currentUserId.slice(0, 12)}…`;
  })();

  const selectedLabel = (() => {
    if (selectedUserId === CREATE_NEW) {
      return t("createNewUser");
    }
    if (selectedUserId === NONE) {
      return t("doNotConnect");
    }
    const u = users.find((u) => u.id === selectedUserId);
    return u ? `${u.display_name || u.email} (${u.email})` : selectedUserId;
  })();

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setPickerOpen(false);
      setPassword("");
      setError(null);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      let result: TeamMemberListItem;
      let successKey: string;
      if (selectedUserId === CREATE_NEW) {
        result = await updateTeamMember(memberId, {
          invite_email: email.trim(),
          invite_password: password,
          invite_role: role,
        });
        successKey = "userAccountCreated";
      } else if (selectedUserId === NONE) {
        result = await updateTeamMember(memberId, { user_id: null });
        successKey = "userAccountUnlinked";
      } else {
        result = await updateTeamMember(memberId, { user_id: selectedUserId });
        successKey = "userAccountLinked";
      }
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: teamMemberKeys.detailPage(memberId),
        }),
        queryClient.invalidateQueries({ queryKey: ["users", "list"] }),
      ]);
      onLinked?.(result);
      toast.success(t(successKey));
      handleOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : t("saveFailed");
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-2">
        {currentUserId ? (
          <>
            <span className="flex items-center gap-1.5 text-muted-foreground text-xs">
              <Link2 className="size-3.5 shrink-0 text-emerald-500" />
              {linkedUserLabel ?? t("userLinked")}
            </span>
            <button
              className="text-muted-foreground text-xs underline-offset-2 hover:text-foreground hover:underline"
              onClick={() => {
                setSelectedUserId(NONE);
                setOpen(true);
              }}
              type="button"
            >
              {t("changeUserLink")}
            </button>
          </>
        ) : (
          <button
            className="flex items-center gap-1.5 text-primary text-xs underline-offset-2 hover:underline"
            onClick={() => {
              setSelectedUserId(CREATE_NEW);
              setEmail(currentEmail ?? "");
              setOpen(true);
            }}
            type="button"
          >
            <UserPlus className="size-3.5" />
            {t("connectOrCreateUser")}
          </button>
        )}
      </div>

      <Dialog onOpenChange={handleOpenChange} open={open}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("connectToUser")}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="font-medium text-sm">{t("searchUser")}</label>
              <Popover onOpenChange={setPickerOpen} open={pickerOpen}>
                <PopoverTrigger asChild>
                  <button
                    aria-expanded={pickerOpen}
                    className={cn(
                      "flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring",
                      selectedUserId === NONE && "text-muted-foreground"
                    )}
                    role="combobox"
                    type="button"
                  >
                    {selectedLabel}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  className="w-(--anchor-width) p-0"
                >
                  <Command shouldFilter>
                    <CommandInput placeholder={t("searchPlaceholder")} />
                    <CommandList>
                      <CommandEmpty>{t("notFound")}</CommandEmpty>
                      <CommandGroup>
                        <CommandItem
                          onSelect={() => {
                            setSelectedUserId(CREATE_NEW);
                            setEmail(currentEmail ?? "");
                            setPickerOpen(false);
                          }}
                          value="create_new"
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              selectedUserId === CREATE_NEW
                                ? "opacity-100"
                                : "opacity-0"
                            )}
                          />
                          {t("createNewUser")}
                        </CommandItem>
                        {currentUserId && (
                          <CommandItem
                            onSelect={() => {
                              setSelectedUserId(NONE);
                              setPickerOpen(false);
                            }}
                            value="none"
                          >
                            <Link2Off className="mr-2 h-4 w-4 text-destructive/60" />
                            {t("unlinkUser")}
                          </CommandItem>
                        )}
                        {users.map((user) => {
                          const label = `${user.display_name || user.email} (${user.email})`;
                          return (
                            <CommandItem
                              key={user.id}
                              onSelect={() => {
                                setSelectedUserId(user.id);
                                setPickerOpen(false);
                              }}
                              value={label}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  selectedUserId === user.id
                                    ? "opacity-100"
                                    : "opacity-0"
                                )}
                              />
                              {label}
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {selectedUserId === CREATE_NEW && (
              <div className="space-y-2">
                <div className="space-y-1.5">
                  <label className="font-medium text-sm">{t("email")}</label>
                  <Input
                    autoComplete="off"
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t("emailPlaceholder") || "user@example.com"}
                    type="email"
                    value={email}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="font-medium text-sm">{t("password")}</label>
                  <PasswordInput
                    labels={{
                      generate: t("passwordGenerate"),
                      hide: t("passwordHide"),
                      medium: t("passwordStrengthMedium"),
                      show: t("passwordShow"),
                      strong: t("passwordStrengthStrong"),
                      weak: t("passwordStrengthWeak"),
                    }}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t("passwordPlaceholder")}
                    value={password}
                  />
                  <p className="text-muted-foreground text-xs">
                    {t("passwordHint")}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <label className="font-medium text-sm">{t("userRole")}</label>
                  <Select
                    onValueChange={(v) => setRole(v as "member" | "admin")}
                    value={role}
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={
                          role === "admin" ? t("roleAdmin") : t("roleMember")
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="member">{t("roleMember")}</SelectItem>
                      <SelectItem value="admin">{t("roleAdmin")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {error && <p className="text-destructive text-xs">{error}</p>}
          </div>

          <DialogFooter>
            <Button
              onClick={() => handleOpenChange(false)}
              type="button"
              variant="ghost"
            >
              {t("cancel")}
            </Button>
            <Button disabled={saving} onClick={handleSave} type="button">
              {saving ? t("loading") : t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
