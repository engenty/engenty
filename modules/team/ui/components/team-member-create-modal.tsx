import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
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
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@engenty/ui-core";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, ChevronsUpDown, ListTree } from "lucide-react";
import { useCallback, useState } from "react";
import { type Control, useForm } from "react-hook-form";
import {
  createTeamMember,
  listUsers,
  type MemberType,
  type TeamMemberListItem,
} from "../api.js";
import {
  type TeamMemberCreateFormValues,
  teamMemberCreateFormDefaults,
  teamMemberCreateFormSchema,
} from "../lib/team-member-create-form-schema.js";
import {
  applySplitFullNameToFormFields,
  teamProfileNamePayloadFromForm,
} from "../lib/team-profile-name-form.js";
import { TeamMemberNameFields } from "./team-member-name-fields.js";

type UserLinkTab = "create_new" | "existing" | "none";

interface TeamMemberCreateModalProps {
  onOpenChange: (open: boolean) => void;
  onSuccess: (created: TeamMemberListItem) => void;
  open: boolean;
}

function userLinkTabFromConnectId(connectUserId: string): UserLinkTab {
  if (connectUserId === "create_new") {
    return "create_new";
  }
  if (connectUserId === "none") {
    return "none";
  }
  return "existing";
}

function InviteRoleField({
  control,
  t,
}: {
  control: Control<TeamMemberCreateFormValues>;
  t: (key: string) => string;
}) {
  return (
    <FormField
      control={control}
      name="invite_role"
      render={({ field }) => (
        <FormItem>
          <FormLabel>{t("userRole")}</FormLabel>
          <Select
            onValueChange={(v) =>
              field.onChange(v as TeamMemberCreateFormValues["invite_role"])
            }
            value={field.value ?? "member"}
          >
            <FormControl>
              <SelectTrigger className="w-full">
                <SelectValue>
                  {(field.value ?? "member") === "admin"
                    ? t("roleAdmin")
                    : t("roleMember")}
                </SelectValue>
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              <SelectItem value="member">{t("roleMember")}</SelectItem>
              <SelectItem value="admin">{t("roleAdmin")}</SelectItem>
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

export function TeamMemberCreateModal({
  open,
  onOpenChange,
  onSuccess,
}: TeamMemberCreateModalProps) {
  const { t } = useTranslation("team");
  const usersQuery = useQuery({
    queryKey: ["users", "list"],
    queryFn: ({ signal }) => listUsers(signal),
    enabled: open,
  });

  const form = useForm<TeamMemberCreateFormValues>({
    resolver: zodResolver(teamMemberCreateFormSchema),
    defaultValues: teamMemberCreateFormDefaults,
  });

  const connectUserId = form.watch("connect_user_id");
  const userLinkTab = userLinkTabFromConnectId(connectUserId);
  const [fullNameVal, setFullNameVal] = useState("");
  const [showNameDetails, setShowNameDetails] = useState(false);
  const [userSearchOpen, setUserSearchOpen] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const handleNameChange = (val: string) => {
    setFullNameVal(val);
    const parts = applySplitFullNameToFormFields(val);
    form.setValue("first_name", parts.first_name ?? "");
    form.setValue("last_name", parts.last_name ?? "");
    form.setValue("middle_name", parts.middle_name ?? "");
    form.setValue("name_prefix", parts.name_prefix ?? "");
    form.setValue("name_suffix", parts.name_suffix ?? "");
  };

  const handleUserLinkTabChange = (tab: string) => {
    const next = tab as UserLinkTab;
    if (next === "create_new") {
      form.setValue("connect_user_id", "create_new");
      return;
    }
    if (next === "none") {
      form.setValue("connect_user_id", "none");
      return;
    }
    if (connectUserId === "create_new" || connectUserId === "none") {
      form.setValue("connect_user_id", "");
    }
  };

  const handleSubmit = useCallback(
    async (values: TeamMemberCreateFormValues) => {
      setApiError(null);
      try {
        const profileEmail = values.email.trim() || null;
        const namePayload = teamProfileNamePayloadFromForm(values);
        const created = await createTeamMember({
          ...namePayload.parts,
          full_name: namePayload.full_name,
          initials: namePayload.initials,
          member_type: values.member_type as MemberType,
          user_id:
            values.connect_user_id !== "create_new" &&
            values.connect_user_id !== "none"
              ? values.connect_user_id
              : null,
          phone: null,
          email: profileEmail,
          position: null,
          department: null,
          location: null,
          ...(values.connect_user_id === "create_new" &&
          profileEmail &&
          values.password &&
          values.password.length >= 6
            ? {
                invite_email: profileEmail,
                invite_password: values.password,
                invite_role: values.invite_role ?? "member",
              }
            : {}),
        });
        form.reset(teamMemberCreateFormDefaults);
        setFullNameVal("");
        setShowNameDetails(false);
        onSuccess(created);
      } catch (err: unknown) {
        setApiError(err instanceof Error ? err.message : t("createFailed"));
      }
    },
    [form, onSuccess, t]
  );

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        form.reset(teamMemberCreateFormDefaults);
        setFullNameVal("");
        setShowNameDetails(false);
        setApiError(null);
      }
      onOpenChange(next);
    },
    [form, onOpenChange]
  );

  const users = usersQuery.data ?? [];
  const selectedExistingUser = users.find((u) => u.id === connectUserId);
  const selectedExistingLabel = selectedExistingUser
    ? `${selectedExistingUser.display_name || selectedExistingUser.email} (${selectedExistingUser.email})`
    : t("searchUserPlaceholder");

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("createMember")}</DialogTitle>
        </DialogHeader>
        {apiError && (
          <div
            className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive text-sm"
            role="alert"
          >
            {apiError}
          </div>
        )}
        <Form {...form}>
          <form
            className="space-y-4"
            onSubmit={form.handleSubmit(handleSubmit)}
          >
            <FormItem>
              <FormLabel>{t("fullName") || "Name"}</FormLabel>
              <div className="flex gap-2">
                <FormControl>
                  <Input
                    className="flex-1"
                    onChange={(e) => handleNameChange(e.target.value)}
                    placeholder={t("fullName") || "Name"}
                    value={fullNameVal}
                  />
                </FormControl>
                <Button
                  aria-expanded={showNameDetails}
                  aria-label={
                    showNameDetails ? t("hideDetails") : t("showDetails")
                  }
                  className="shrink-0"
                  onClick={() => setShowNameDetails(!showNameDetails)}
                  size="icon"
                  type="button"
                  variant="outline"
                >
                  <ListTree className="h-4 w-4" />
                </Button>
              </div>
              <FormMessage />
            </FormItem>

            {showNameDetails ? (
              <div>
                <TeamMemberNameFields control={form.control} t={t} />
              </div>
            ) : null}

            <FormField
              control={form.control}
              name="member_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("memberType")}</FormLabel>
                  <Select
                    onValueChange={(v) =>
                      field.onChange(
                        v as TeamMemberCreateFormValues["member_type"]
                      )
                    }
                    value={field.value}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder={t("selectType")}>
                          {field.value === "external"
                            ? t("memberTypeExternal")
                            : field.value === "contractor"
                              ? t("memberTypeContractor")
                              : field.value
                                ? t("memberTypeInternal")
                                : t("selectType")}
                        </SelectValue>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="internal">
                        {t("memberTypeInternal")}
                      </SelectItem>
                      <SelectItem value="external">
                        {t("memberTypeExternal")}
                      </SelectItem>
                      <SelectItem value="contractor">
                        {t("memberTypeContractor")}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Tabs onValueChange={handleUserLinkTabChange} value={userLinkTab}>
              <TabsList className="grid h-auto w-full grid-cols-3">
                <TabsTrigger value="create_new">{t("tabNewUser")}</TabsTrigger>
                <TabsTrigger value="existing">
                  {t("tabExistingUser")}
                </TabsTrigger>
                <TabsTrigger value="none">{t("tabNoUser")}</TabsTrigger>
              </TabsList>

              <TabsContent className="mt-4 space-y-4" value="create_new">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("email")}</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          {...field}
                          value={field.value ?? ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("password")}</FormLabel>
                      <FormControl>
                        <PasswordInput
                          labels={{
                            generate: t("passwordGenerate"),
                            hide: t("passwordHide"),
                            medium: t("passwordStrengthMedium"),
                            show: t("passwordShow"),
                            strong: t("passwordStrengthStrong"),
                            weak: t("passwordStrengthWeak"),
                          }}
                          placeholder={t("passwordPlaceholder")}
                          {...field}
                        />
                      </FormControl>
                      <p className="text-muted-foreground text-xs">
                        {t("passwordHint")}
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <InviteRoleField control={form.control} t={t} />
              </TabsContent>

              <TabsContent className="mt-4 space-y-4" value="existing">
                <FormField
                  control={form.control}
                  name="connect_user_id"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>{t("searchUser")}</FormLabel>
                      <Popover
                        onOpenChange={setUserSearchOpen}
                        open={userSearchOpen}
                      >
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              aria-expanded={userSearchOpen}
                              className={cn(
                                "w-full justify-between font-normal",
                                !selectedExistingUser && "text-muted-foreground"
                              )}
                              role="combobox"
                              variant="outline"
                            >
                              {selectedExistingLabel}
                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent
                          align="start"
                          className="w-(--anchor-width) p-0"
                        >
                          <Command shouldFilter>
                            <CommandInput
                              placeholder={t("searchUserPlaceholder")}
                            />
                            <CommandList>
                              <CommandEmpty>{t("notFound")}</CommandEmpty>
                              <CommandGroup>
                                {users.map((user) => {
                                  const label = `${user.display_name || user.email} (${user.email})`;
                                  return (
                                    <CommandItem
                                      key={user.id}
                                      onSelect={() => {
                                        field.onChange(user.id);
                                        form.setValue("email", user.email);
                                        setUserSearchOpen(false);
                                      }}
                                      value={label}
                                    >
                                      <Check
                                        className={cn(
                                          "mr-2 h-4 w-4",
                                          field.value === user.id
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
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <InviteRoleField control={form.control} t={t} />
              </TabsContent>

              <TabsContent className="mt-4" value="none">
                <p className="text-muted-foreground text-sm">
                  {t("noUserHint")}
                </p>
              </TabsContent>
            </Tabs>

            <DialogFooter>
              <Button
                onClick={() => handleOpenChange(false)}
                type="button"
                variant="outline"
              >
                {t("cancel")}
              </Button>
              <Button disabled={form.formState.isSubmitting} type="submit">
                {form.formState.isSubmitting
                  ? t("creating")
                  : t("createMember")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
