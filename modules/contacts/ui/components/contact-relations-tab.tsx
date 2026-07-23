import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
  Card,
  CardSection,
} from "@engenty/ui-core";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { ContactListItem, ContactRelationListItem } from "../api.js";
import { contactsListOptions } from "../queries.js";
import {
  useContactRelationsQuery,
  useCreateContactRelationMutation,
  useDeleteContactRelationMutation,
  useUpdateContactRelationMutation,
} from "../relation-queries.js";
import {
  ContactRelationDialog,
  type ContactRelationDialogSubmitPayload,
} from "./contact-relation-dialog.js";

interface ContactRelationsTabProps {
  entity: ContactListItem;
}

export function ContactRelationsTab({ entity }: ContactRelationsTabProps) {
  const { t } = useTranslation("contacts");
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [editingRelation, setEditingRelation] =
    useState<ContactRelationListItem | null>(null);
  const [relationToDelete, setRelationToDelete] =
    useState<ContactRelationListItem | null>(null);

  const relationsQuery = useContactRelationsQuery(entity.id);
  const createRelationMutation = useCreateContactRelationMutation();
  const updateRelationMutation = useUpdateContactRelationMutation();
  const deleteRelationMutation = useDeleteContactRelationMutation();
  const peopleQuery = useQuery({
    ...contactsListOptions({
      include_linked_invoice_counts: false,
      page: 1,
      pageSize: 200,
      sortBy: "display_name",
      sortOrder: "asc",
      type: "person",
    }),
    enabled: dialogOpen,
  });

  const people = useMemo(
    () =>
      (peopleQuery.data?.data ?? []).map((person) => ({
        display_name: person.display_name,
        id: person.id,
      })),
    [peopleQuery.data?.data]
  );

  const visibleRelations = useMemo(
    () =>
      (relationsQuery.data ?? []).filter(
        (relation) => relation.other_contact.type === "person"
      ),
    [relationsQuery.data]
  );

  async function handleDialogSubmit(
    payload: ContactRelationDialogSubmitPayload
  ) {
    setDialogError(null);
    try {
      if (payload.mode === "create") {
        await createRelationMutation.mutateAsync(payload.input);
      } else {
        await updateRelationMutation.mutateAsync({
          patch: payload.patch,
          relationId: payload.relationId,
        });
      }
      setDialogOpen(false);
      setEditingRelation(null);
    } catch (error) {
      setDialogError(error instanceof Error ? error.message : t("saveFailed"));
    }
  }

  async function handleDelete() {
    if (!relationToDelete) {
      return;
    }
    try {
      await deleteRelationMutation.mutateAsync(relationToDelete.id);
      setRelationToDelete(null);
    } catch (error) {
      setDialogError(error instanceof Error ? error.message : t("saveFailed"));
    }
  }

  return (
    <section className="space-y-4">
      <CardSection.Header
        action={
          <Button
            onClick={() => {
              setDialogError(null);
              setEditingRelation(null);
              setDialogOpen(true);
            }}
            type="button"
          >
            <Plus className="mr-2 size-4" />
            {t("relations.addRelation", { defaultValue: "Add relation" })}
          </Button>
        }
        description={t("relations.currentPeopleDescription", {
          defaultValue:
            "Manage the current people linked to this organisation.",
        })}
        title={t("relations.currentPeople", { defaultValue: "People" })}
      />

      {dialogError ? (
        <div
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive text-sm"
          role="alert"
        >
          {dialogError}
        </div>
      ) : null}

      {relationsQuery.isLoading ? (
        <Card className="px-4 py-6 text-muted-foreground text-sm">
          {t("loading")}
        </Card>
      ) : visibleRelations.length === 0 ? (
        <Card className="px-4 py-6 text-muted-foreground text-sm">
          {t("relations.empty", {
            defaultValue: "No people are linked to this organisation yet.",
          })}
        </Card>
      ) : (
        <div className="space-y-3">
          {visibleRelations.map((relation) => {
            const detailLine = [
              relation.role,
              relation.position,
              relation.department,
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <Card className="px-4 py-4" key={relation.id}>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        className="text-left font-medium hover:underline"
                        onClick={() =>
                          navigate(`/mdl/contacts/${relation.other_contact.id}`)
                        }
                        type="button"
                      >
                        {relation.other_contact.display_name}
                      </button>
                      {relation.is_primary ? (
                        <Badge variant="outline">
                          {t("relations.primaryBadge", {
                            defaultValue: "Primary",
                          })}
                        </Badge>
                      ) : null}
                    </div>
                    {detailLine ? (
                      <p className="text-muted-foreground text-sm">
                        {detailLine}
                      </p>
                    ) : null}
                    <p className="text-muted-foreground text-sm">
                      {[
                        relation.other_contact.email,
                        relation.other_contact.phone,
                      ]
                        .filter(Boolean)
                        .join(" · ") || t("noEntities")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={() => {
                        setDialogError(null);
                        setEditingRelation(relation);
                        setDialogOpen(true);
                      }}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <Pencil className="mr-2 size-4" />
                      {t("edit")}
                    </Button>
                    <Button
                      onClick={() => setRelationToDelete(relation)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <Trash2 className="mr-2 size-4" />
                      {t("delete")}
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <ContactRelationDialog
        error={dialogError}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setEditingRelation(null);
            setDialogError(null);
          }
        }}
        onSubmit={handleDialogSubmit}
        open={dialogOpen}
        organisationId={entity.id}
        people={people}
        relation={editingRelation}
        submitting={
          createRelationMutation.isPending ||
          updateRelationMutation.isPending ||
          peopleQuery.isLoading
        }
        t={t}
      />

      <AlertDialog
        onOpenChange={(open) => !open && setRelationToDelete(null)}
        open={relationToDelete != null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("relations.removeTitle", {
                defaultValue: "Remove relation?",
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("relations.removeDescription", {
                defaultValue:
                  "This removes the current organisation-person relation.",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleDelete()}>
              {deleteRelationMutation.isPending ? t("deleting") : t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
