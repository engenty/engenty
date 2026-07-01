import { useTranslation } from "@engenty/i18n/ui";
import { Badge, Card } from "@engenty/ui-core";
import { useNavigate } from "react-router-dom";
import type { ContactListItem } from "../api.js";
import { useContactRelationsQuery } from "../relation-queries.js";

interface ContactAffiliationsCardProps {
  entity: ContactListItem;
}

export function ContactAffiliationsCard({
  entity,
}: ContactAffiliationsCardProps) {
  const { t } = useTranslation("contacts");
  const navigate = useNavigate();
  const relationsQuery = useContactRelationsQuery(entity.id);

  if (relationsQuery.isLoading) {
    return (
      <section className="space-y-3">
        <h2 className="font-semibold text-lg">
          {t("relations.affiliations", { defaultValue: "Affiliations" })}
        </h2>
        <Card className="px-4 py-4 text-muted-foreground text-sm">
          {t("loading")}
        </Card>
      </section>
    );
  }

  const organisationRelations = (relationsQuery.data ?? []).filter(
    (relation) => relation.other_contact.type === "organisation"
  );

  if (organisationRelations.length === 0) {
    return null;
  }

  return (
    <section className="space-y-3">
      <h2 className="font-semibold text-lg">
        {t("relations.affiliations", { defaultValue: "Affiliations" })}
      </h2>
      <Card className="px-4 py-4">
        <div className="space-y-3">
          {organisationRelations.map((relation) => {
            const detailLine = [
              relation.role,
              relation.position,
              relation.department,
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <div
                className="flex items-start justify-between gap-4"
                key={relation.id}
              >
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
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </section>
  );
}
