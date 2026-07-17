import { useCoreAuthSession } from "@engenty/auth-ui";
import { useTranslation } from "@engenty/i18n/ui";
import {
  Avatar,
  AvatarFallback,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  ScrollArea,
} from "@engenty/ui-core";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { isServiceIdentity } from "../hooks/use-mention-candidates.js";
import { authorInitials, userLabel } from "../lib/format.js";
import { useOpenDmMutation, useTenantUsersQuery } from "../queries.js";

export function NewDmDialog({
  onOpenChange,
  open,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const { t } = useTranslation("team-chat");
  const navigate = useNavigate();
  const { session } = useCoreAuthSession();
  const currentUserId = session?.user?.id ?? null;
  const usersQuery = useTenantUsersQuery();
  const openDm = useOpenDmMutation();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");

  const candidates = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return (usersQuery.data ?? [])
      .filter((user) => user.id !== currentUserId)
      .filter((user) => !isServiceIdentity(user.email))
      .filter(
        (user) =>
          !needle ||
          user.display_name.toLowerCase().includes(needle) ||
          (user.email ?? "").toLowerCase().includes(needle)
      );
  }, [usersQuery.data, currentUserId, filter]);

  const toggle = (id: string) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const submit = () => {
    if (selected.size === 0) {
      return;
    }
    openDm.mutate([...selected], {
      onError: (error) =>
        toast.error(t("toasts.actionFailed", { error: String(error) })),
      onSuccess: (conversation) => {
        onOpenChange(false);
        setSelected(new Set());
        setFilter("");
        navigate(`/mdl/team-chat/${conversation.id}`);
      },
    });
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("dialogs.newDmTitle")}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Input
            autoFocus
            onChange={(event) => setFilter(event.target.value)}
            placeholder={t("dialogs.dmPickHint")}
            value={filter}
          />
          <ScrollArea className="max-h-64">
            <div className="flex flex-col gap-1 pr-2">
              {candidates.map((user) => {
                const label = userLabel(user, user.email ?? user.id);
                return (
                  <label
                    className="flex cursor-pointer items-center gap-2 rounded-[4px] px-2 py-1.5 hover:bg-muted/60"
                    key={user.id}
                  >
                    <Checkbox
                      checked={selected.has(user.id)}
                      onCheckedChange={() => toggle(user.id)}
                    />
                    <Avatar className="size-6">
                      <AvatarFallback className="text-[10px]">
                        {user.initials ?? authorInitials(label)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {label}
                    </span>
                    <span className="truncate text-muted-foreground text-xs">
                      {user.email}
                    </span>
                  </label>
                );
              })}
            </div>
          </ScrollArea>
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="ghost">
            {t("dialogs.cancel")}
          </Button>
          <Button
            disabled={selected.size === 0 || openDm.isPending}
            onClick={submit}
          >
            {t("dialogs.start")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
