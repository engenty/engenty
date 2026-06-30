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
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@engenty/ui-core";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, ChevronDown, ChevronsUpDown, ChevronUp } from "lucide-react";
import { useCallback, useState } from "react";
import { useForm } from "react-hook-form";
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

interface TeamMemberCreateModalProps {
  onOpenChange: (open: boolean) => void;
  onSuccess: (created: TeamMemberListItem) => void;
  open: boolean;
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
        setApiError(null);
      }
      onOpenChange(next);
    },
    [form, onOpenChange]
  );

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
              <FormControl>
                <Input
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder={t("fullName") || "Name"}
                  value={fullNameVal}
                />
              </FormControl>
              <FormMessage />
            </FormItem>

            <div>
              <Button
                className="flex h-auto items-center gap-1.5 p-0 text-muted-foreground text-xs hover:bg-transparent"
                onClick={() => setShowNameDetails(!showNameDetails)}
                size="sm"
                type="button"
                variant="ghost"
              >
                {showNameDetails ? (
                  <>
                    <ChevronUp className="h-3 w-3" />
                    {t("hideDetails") || "Details ausblenden"}
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-3 w-3" />
                    {t("showDetails") || "Details anzeigen"}
                  </>
                )}
              </Button>

              {showNameDetails && (
                <div className="mt-3">
                  <TeamMemberNameFields control={form.control} t={t} />
                </div>
              )}
            </div>
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("email")}</FormLabel>
                  <FormControl>
                    <Input type="email" {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
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
                      <SelectTrigger>
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

            <FormField
              control={form.control}
              name="connect_user_id"
              render={({ field }) => {
                const users = usersQuery.data ?? [];
                let selectedLabel = t("createNewUser");
                if (field.value === "none") {
                  selectedLabel = t("doNotConnect");
                } else {
                  const found = users.find((u) => u.id === field.value);
                  if (found) {
                    selectedLabel = `${found.display_name || found.email} (${found.email})`;
                  }
                }

                return (
                  <FormItem className="flex flex-col">
                    <FormLabel>{t("connectToUser")}</FormLabel>
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
                              field.value === "none" && "text-muted-foreground"
                            )}
                            role="combobox"
                            variant="outline"
                          >
                            {selectedLabel}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </FormControl>
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
                                  field.onChange("create_new");
                                  setUserSearchOpen(false);
                                }}
                                value="create_new"
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    field.value === "create_new"
                                      ? "opacity-100"
                                      : "opacity-0"
                                  )}
                                />
                                {t("createNewUser")}
                              </CommandItem>
                              <CommandItem
                                onSelect={() => {
                                  field.onChange("none");
                                  setUserSearchOpen(false);
                                }}
                                value="none"
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    field.value === "none"
                                      ? "opacity-100"
                                      : "opacity-0"
                                  )}
                                />
                                {t("doNotConnect")}
                              </CommandItem>
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
                );
              }}
            />

            {connectUserId === "create_new" && (
              <>
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("password")}</FormLabel>
                      <FormControl>
                        <Input
                          autoComplete="new-password"
                          placeholder={t("passwordPlaceholder")}
                          type="password"
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
                <FormField
                  control={form.control}
                  name="invite_role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("userRole")}</FormLabel>
                      <Select
                        onValueChange={(v) =>
                          field.onChange(
                            v as TeamMemberCreateFormValues["invite_role"]
                          )
                        }
                        value={field.value ?? "member"}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue>
                              {(field.value ?? "member") === "admin"
                                ? t("roleAdmin")
                                : t("roleMember")}
                            </SelectValue>
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="member">
                            {t("roleMember")}
                          </SelectItem>
                          <SelectItem value="admin">
                            {t("roleAdmin")}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}

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
