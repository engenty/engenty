import { useTranslation } from "@engenty/i18n/ui";
import { Badge } from "@engenty/ui-core";
import { ExternalLink, Mail, Phone } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { ContactRelationListItem } from "../api.js";

interface ContactPersonCardProps {
  relation: ContactRelationListItem;
}

export function ContactPersonCard({ relation }: ContactPersonCardProps) {
  const { t } = useTranslation("contacts");
  const navigate = useNavigate();
  const { other_contact: person } = relation;
  const initials = person.display_name.charAt(0).toUpperCase();
  const detailLine = [relation.position, relation.department]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="group ui-card-panel ui-card-interactive relative flex items-start gap-3 p-3">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted font-semibold text-muted-foreground text-sm">
        {initials}
      </div>

      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex items-center gap-2">
          <button
            className="truncate font-medium text-sm hover:underline"
            onClick={() => navigate(`/mdl/contacts/${person.id}`)}
            type="button"
          >
            {person.display_name}
          </button>
          {relation.is_primary && (
            <Badge className="shrink-0" variant="outline">
              {t("relations.primaryBadge")}
            </Badge>
          )}
        </div>

        {detailLine && (
          <p className="truncate text-muted-foreground text-xs">{detailLine}</p>
        )}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-muted-foreground text-xs">
          {person.email && (
            <a
              className="inline-flex items-center gap-1 hover:text-foreground"
              href={`mailto:${person.email}`}
            >
              <Mail className="size-3" />
              <span className="truncate">{person.email}</span>
            </a>
          )}
          {person.phone && (
            <a
              className="inline-flex items-center gap-1 hover:text-foreground"
              href={`tel:${person.phone}`}
            >
              <Phone className="size-3" />
              <span>{person.phone}</span>
            </a>
          )}
        </div>
      </div>

      <button
        className="absolute top-2 right-2 rounded-sm p-1 opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100"
        onClick={() => navigate(`/mdl/contacts/${person.id}`)}
        title={t("edit")}
        type="button"
      >
        <ExternalLink className="size-3.5 text-muted-foreground" />
      </button>
    </div>
  );
}
