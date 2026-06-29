import { useCoreAuthSession } from "@engenty/auth-ui";
import { Button } from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { getUserTableColumns } from "../components/users/columns.js";
import {
  applyUserFilters,
  createDefaultUserColumnOrder,
  createDefaultUserColumnVisibility,
  type UserFilters,
} from "../components/users/types.js";
import { useTeamSelection as useUserSelection } from "../components/users/use-user-selection.js";
import { UserInviteDialog } from "../components/users/user-invite-dialog.js";
import { UsersTable } from "../components/users/users-table.js";
import { UsersTableToolbar } from "../components/users/users-table-toolbar.js";
import { useUserListEnrichments } from "../hooks/use-user-list-enrichments.js";
import { inviteUserSchema } from "../lib/schemas.js";
import {
  deleteUsers,
  inviteUser,
  isCurrentUserAdmin,
  listUsers,
  updateUserProfile,
} from "../lib/user-management-api.js";

export function UsersListPage() {
  const navigate = useNavigate();
  const { session } = useCoreAuthSession();
  const columns = useMemo(() => getUserTableColumns(), []);
  const [users, setUsers] = useState<Awaited<ReturnType<typeof listUsers>>>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [tableSize, setTableSize] = useState<"compact" | "normal">("compact");
  const [columnVisibility, setColumnVisibility] = useState(() =>
    createDefaultUserColumnVisibility()
  );
  const [columnOrder, setColumnOrder] = useState(() =>
    createDefaultUserColumnOrder()
  );
  const [filters, setFilters] = useState<UserFilters>({
    searchQuery: "",
    roleFilter: "all",
  });

  const inviteForm = useForm({
    resolver: zodResolver(inviteUserSchema),
    defaultValues: {
      email: "",
      password: "",
      display_name: "",
      role: "member" as const,
      phone: "",
    },
  });

  useEffect(() => {
    if (!session?.access_token) {
      return;
    }
    setLoading(true);
    setLoadError(null);
    listUsers()
      .then(async (members) => {
        setUsers(members);
        try {
          setIsAdmin(await isCurrentUserAdmin());
        } catch {
          setIsAdmin(false);
        }
      })
      .catch((error) => {
        setLoadError(
          error instanceof Error ? error.message : "Failed to load users."
        );
      })
      .finally(() => setLoading(false));
  }, [session?.access_token]);

  const currentUserId = session?.user?.id ?? null;
  const filteredUsers = useMemo(
    () => applyUserFilters(users, filters),
    [users, filters]
  );
  const enrichments = useUserListEnrichments(filteredUsers);
  const hasActiveFilters =
    Boolean(filters.searchQuery) || filters.roleFilter !== "all";

  const selection = useUserSelection(filteredUsers, currentUserId);

  const handleDeleteSelected = async () => {
    if (!isAdmin) {
      return;
    }
    try {
      await deleteUsers(Array.from(selection.selectedIds));
      const refreshed = await listUsers();
      setUsers(refreshed);
      selection.clearSelection();
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : "Failed to delete selected users."
      );
    }
  };

  const handleInvite = inviteForm.handleSubmit(async (values) => {
    try {
      await inviteUser(values);
      setInviteDialogOpen(false);
      inviteForm.reset();
      setUsers(await listUsers());
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Failed to invite user."
      );
    }
  });

  const handleRoleChange = async (userId: string, role: "admin" | "member") => {
    try {
      await updateUserProfile(userId, { role });
      setUsers((prev) =>
        prev.map((item) => (item.id === userId ? { ...item, role } : item))
      );
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Failed to update role."
      );
    }
  };

  const clearFilters = () => {
    setFilters({
      searchQuery: "",
      roleFilter: "all",
    });
  };

  const pageActions = useMemo(
    () =>
      session && isAdmin ? (
        <Button
          className="h-8 gap-1.5 px-2.5 text-xs"
          onClick={() => setInviteDialogOpen(true)}
          size="sm"
        >
          <Plus className="h-3.5 w-3.5" />
          Add user
        </Button>
      ) : null,
    [isAdmin, session]
  );

  const breadcrumbs = useMemo(
    () => (session ? [{ label: "Users" }] : []),
    [session]
  );

  usePageConfig({
    breadcrumbs,
    actions: pageActions,
  });

  if (!session) {
    return (
      <div className="p-6 text-muted-foreground text-sm">Sign in required.</div>
    );
  }

  return (
    <div className="flex h-full flex-col p-page">
      {loadError && (
        <div className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive text-sm">
          {loadError}
        </div>
      )}

      {!loading && (
        <UsersTableToolbar
          columnOrder={columnOrder}
          columns={columns}
          columnVisibility={columnVisibility}
          hasActiveFilters={hasActiveFilters}
          isAdmin={isAdmin}
          onClearFilters={clearFilters}
          onDeleteSelected={handleDeleteSelected}
          roleFilter={filters.roleFilter}
          searchQuery={filters.searchQuery}
          selectedCount={selection.selectedIds.size}
          setColumnOrder={setColumnOrder}
          setColumnVisibility={setColumnVisibility}
          setRoleFilter={(value) =>
            setFilters((prev) => ({ ...prev, roleFilter: value }))
          }
          setSearchQuery={(value) =>
            setFilters((prev) => ({ ...prev, searchQuery: value }))
          }
          setTableSize={setTableSize}
          tableSize={tableSize}
          totalCount={filteredUsers.length}
        />
      )}

      <div className="min-h-0 flex-1 overflow-auto rounded-lg border bg-card">
        <UsersTable
          allSelected={selection.allSelected}
          columnOrder={columnOrder}
          columns={columns}
          columnVisibility={columnVisibility}
          currentUserId={currentUserId}
          enrichments={enrichments}
          isAdmin={isAdmin}
          onNavigate={navigate}
          onOpenUser={(userId) => navigate(`/admin/users/${userId}`)}
          onRoleChange={handleRoleChange}
          onToggleSelectAll={selection.toggleSelectAll}
          onToggleSelectOne={selection.toggleSelectOne}
          selectedIds={selection.selectedIds}
          someSelected={selection.someSelected}
          tableSize={tableSize}
          users={filteredUsers}
        />
      </div>

      <UserInviteDialog
        form={inviteForm}
        onOpenChange={setInviteDialogOpen}
        onSubmit={handleInvite}
        open={inviteDialogOpen}
      />
    </div>
  );
}
