import { useTranslation } from "@engenty/i18n/ui";
import { Badge, CardSection } from "@engenty/ui-core";
import { AnimatedCheckIcon, AnimatedCopyIcon } from "@engenty/ui-icons";
import { ExternalLink, MapPin } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FIXED_CONTACT_ROLES } from "../api/role-menu-settings.js";
import type { ContactListItem } from "../api.js";
import { useContactsRoleOptions } from "../hooks/use-contacts-role-options.js";
import { useContactRelationsQuery } from "../relation-queries.js";
import { ContactNotesField } from "./contact-notes-field.js";
import { ContactPersonCard } from "./contact-person-card.js";

interface ContactOverviewTabProps {
  entity: ContactListItem;
}

function formatAddress(entity: ContactListItem): string | null {
  const parts = [
    entity.address_street,
    entity.address_info,
    [entity.address_zip, entity.address_city].filter(Boolean).join(" "),
    entity.address_country,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

function googleMapsUrl(entity: ContactListItem): string | null {
  const addr = formatAddress(entity);
  if (!addr) {
    return null;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`;
}

function referenceHashLine(entity: ContactListItem): string | null {
  const r = entity.reference_id?.trim();
  if (!r) {
    return null;
  }
  return r.startsWith("#") ? r : `# ${r}`;
}

function hrefForOverviewKind(
  kind: "plain" | "email" | "tel" | "url",
  raw: string
): string | null {
  if (kind === "email") {
    return `mailto:${raw}`;
  }
  if (kind === "tel") {
    return `tel:${raw.replace(/[\s()-]/g, "")}`;
  }
  if (kind === "url") {
    return raw.includes("://") ? raw : `https://${raw}`;
  }
  return null;
}

function OverviewValueRow({
  kind,
  t,
  value,
}: {
  kind: "plain" | "email" | "tel" | "url";
  t: (key: string, options?: { defaultValue?: string }) => string;
  value: string;
}) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const href = hrefForOverviewKind(kind, value);

  const copy = useCallback(() => {
    void navigator.clipboard.writeText(value);
    setCopied(true);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 1500);
  }, [value]);

  return (
    <div className="group/ovr flex min-w-0 items-center gap-1.5 text-sm">
      {href ? (
        <a
          className="min-w-0 flex-1 truncate text-foreground hover:underline"
          href={href}
          rel={kind === "url" ? "noopener noreferrer" : undefined}
          target={kind === "url" ? "_blank" : undefined}
        >
          {value}
        </a>
      ) : (
        <button
          className="min-w-0 flex-1 cursor-pointer truncate text-left hover:underline"
          onClick={copy}
          type="button"
        >
          {value}
        </button>
      )}
      <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover/ovr:opacity-100">
        <button
          aria-label={t("detail.copied")}
          className="rounded-sm p-1 hover:bg-muted"
          onClick={(e) => {
            e.preventDefault();
            copy();
          }}
          title={t("detail.copied")}
          type="button"
        >
          {copied ? (
            <AnimatedCheckIcon className="text-green-600" size="xs" />
          ) : (
            <AnimatedCopyIcon className="text-muted-foreground" size="xs" />
          )}
        </button>
        {href ? (
          <a
            aria-label={t("detail.openLink")}
            className="rounded-sm p-1 hover:bg-muted"
            href={href}
            rel={kind === "url" ? "noopener noreferrer" : undefined}
            target={kind === "url" ? "_blank" : undefined}
            title={t("detail.openLink")}
          >
            <ExternalLink
              aria-hidden
              className="size-3.5 text-muted-foreground"
            />
          </a>
        ) : null}
      </div>
    </div>
  );
}

function OverviewOptionalRow({
  kind,
  t,
  value,
}: {
  kind: "plain" | "email" | "tel" | "url";
  t: (key: string, options?: { defaultValue?: string }) => string;
  value: string | null | undefined;
}) {
  const v = value?.trim();
  if (!v) {
    return null;
  }
  return <OverviewValueRow kind={kind} t={t} value={v} />;
}

function OverviewLabeledRow({
  kind,
  label,
  t,
  value,
}: {
  kind: "plain" | "email" | "tel" | "url";
  label: string;
  t: (key: string, options?: { defaultValue?: string }) => string;
  value: string | null | undefined;
}) {
  const v = value?.trim();
  if (!v) {
    return null;
  }
  return (
    <div className="flex gap-3 text-sm">
      <span className="w-36 shrink-0 text-muted-foreground">{label}</span>
      <div className="min-w-0 flex-1">
        <OverviewValueRow kind={kind} t={t} value={v} />
      </div>
    </div>
  );
}

function OverviewIdAndRolesRow({
  entity,
  refLine,
  t,
}: {
  entity: ContactListItem;
  refLine: string | null;
  t: (key: string, options?: { defaultValue?: string }) => string;
}) {
  const slugs = entity.roles ?? [];
  const roleOptions = useContactsRoleOptions();

  const labels = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of roleOptions) {
      const label =
        item.title?.trim() ||
        (FIXED_CONTACT_ROLES.includes(
          item.slug as (typeof FIXED_CONTACT_ROLES)[number]
        )
          ? t(`role.${item.slug}`)
          : item.slug);
      map.set(item.slug, label);
    }
    return map;
  }, [roleOptions, t]);

  if (!refLine && slugs.length === 0) {
    return null;
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
      {refLine ? (
        <p className="shrink-0 font-medium font-mono text-muted-foreground text-sm tabular-nums">
          {refLine}
        </p>
      ) : null}
      {slugs.length > 0 ? (
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-1.5">
          {slugs.map((slug) => (
            <Badge
              className="font-normal text-muted-foreground"
              key={slug}
              variant="outline"
            >
              {labels.get(slug) ?? slug}
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function OrgOverviewLeft({
  entity,
  t,
}: {
  entity: ContactListItem;
  t: (key: string, options?: { defaultValue?: string }) => string;
}) {
  const address = formatAddress(entity);
  const mapsUrl = googleMapsUrl(entity);
  const refLine = referenceHashLine(entity);
  const [addressCopied, setAddressCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const billingEmail =
    entity.billing_email?.trim() || entity.email?.trim() || null;

  const copyAddress = useCallback(() => {
    if (!address) {
      return;
    }
    void navigator.clipboard.writeText(address);
    setAddressCopied(true);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setAddressCopied(false), 1500);
  }, [address]);

  const hasLegalBlock =
    Boolean(entity.vat_id?.trim()) ||
    Boolean(entity.tax_id?.trim()) ||
    Boolean(entity.registration_number?.trim()) ||
    Boolean(entity.website_contact?.trim()) ||
    Boolean(entity.website_impress?.trim());

  const hasBillingBlock =
    Boolean(entity.contact_name?.trim()) ||
    Boolean(billingEmail) ||
    Boolean(entity.phone?.trim());

  return (
    <div className="space-y-6">
      <OverviewIdAndRolesRow entity={entity} refLine={refLine} t={t} />

      {address ? (
        <section className="space-y-2">
          <CardSection.Header
            title={t("detail.overviewAddressHeading", {
              defaultValue: "Address",
            })}
            variant="meta"
          />
          <div className="group/ad flex items-start gap-2 text-sm">
            <p className="min-w-0 flex-1 whitespace-pre-line text-foreground">
              {address}
            </p>
            <div className="flex shrink-0 gap-0.5 self-start opacity-0 transition-opacity group-hover/ad:opacity-100">
              <button
                className="rounded-sm p-1 hover:bg-muted"
                onClick={copyAddress}
                title={addressCopied ? t("detail.copied") : t("detail.copy")}
                type="button"
              >
                {addressCopied ? (
                  <AnimatedCheckIcon className="text-green-600" size="xs" />
                ) : (
                  <AnimatedCopyIcon
                    className="text-muted-foreground"
                    size="xs"
                  />
                )}
              </button>
              {mapsUrl ? (
                <a
                  className="rounded-sm p-1 hover:bg-muted"
                  href={mapsUrl}
                  rel="noopener noreferrer"
                  target="_blank"
                  title={t("detail.directions")}
                >
                  <MapPin className="size-3.5 text-muted-foreground" />
                </a>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {hasBillingBlock ? (
        <section className="space-y-2">
          <CardSection.Header
            title={t("detail.overviewBillingContactHeading", {
              defaultValue: "Billing contact",
            })}
            variant="meta"
          />
          <div className="space-y-1">
            <OverviewOptionalRow
              kind="plain"
              t={t}
              value={entity.contact_name}
            />
            <OverviewOptionalRow kind="email" t={t} value={billingEmail} />
            <OverviewOptionalRow kind="tel" t={t} value={entity.phone} />
          </div>
        </section>
      ) : null}

      {hasLegalBlock ? (
        <section className="space-y-2">
          <div className="space-y-2">
            <OverviewLabeledRow
              kind="plain"
              label={t("vatId")}
              t={t}
              value={entity.vat_id}
            />
            <OverviewLabeledRow
              kind="plain"
              label={t("taxId")}
              t={t}
              value={entity.tax_id}
            />
            <OverviewLabeledRow
              kind="plain"
              label={t("registrationNumber")}
              t={t}
              value={entity.registration_number}
            />
            <OverviewLabeledRow
              kind="url"
              label={t("websiteContact")}
              t={t}
              value={entity.website_contact}
            />
            <OverviewLabeledRow
              kind="url"
              label={t("websiteImpress")}
              t={t}
              value={entity.website_impress}
            />
          </div>
        </section>
      ) : null}
    </div>
  );
}

function PersonOverviewLeft({
  entity,
  t,
}: {
  entity: ContactListItem;
  t: (key: string, options?: { defaultValue?: string }) => string;
}) {
  const address = formatAddress(entity);
  const mapsUrl = googleMapsUrl(entity);
  const refLine = referenceHashLine(entity);
  const [addressCopied, setAddressCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const copyAddress = useCallback(() => {
    if (!address) {
      return;
    }
    void navigator.clipboard.writeText(address);
    setAddressCopied(true);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setAddressCopied(false), 1500);
  }, [address]);

  const hasContactBlock =
    Boolean(entity.email?.trim()) ||
    Boolean(entity.phone?.trim()) ||
    Boolean(entity.website_contact?.trim());

  return (
    <div className="space-y-6">
      <OverviewIdAndRolesRow entity={entity} refLine={refLine} t={t} />

      {address ? (
        <section className="space-y-2">
          <CardSection.Header
            title={t("detail.overviewAddressHeading", {
              defaultValue: "Address",
            })}
            variant="meta"
          />
          <div className="group/ad flex items-start gap-2 text-sm">
            <p className="min-w-0 flex-1 whitespace-pre-line text-foreground">
              {address}
            </p>
            <div className="flex shrink-0 gap-0.5 self-start opacity-0 transition-opacity group-hover/ad:opacity-100">
              <button
                className="rounded-sm p-1 hover:bg-muted"
                onClick={copyAddress}
                title={addressCopied ? t("detail.copied") : t("detail.copy")}
                type="button"
              >
                {addressCopied ? (
                  <AnimatedCheckIcon className="text-green-600" size="xs" />
                ) : (
                  <AnimatedCopyIcon
                    className="text-muted-foreground"
                    size="xs"
                  />
                )}
              </button>
              {mapsUrl ? (
                <a
                  className="rounded-sm p-1 hover:bg-muted"
                  href={mapsUrl}
                  rel="noopener noreferrer"
                  target="_blank"
                  title={t("detail.directions")}
                >
                  <MapPin className="size-3.5 text-muted-foreground" />
                </a>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {hasContactBlock ? (
        <section className="space-y-2">
          <CardSection.Header
            title={t("detail.overviewPersonContactHeading", {
              defaultValue: "Contact",
            })}
            variant="meta"
          />
          <div className="space-y-1">
            <OverviewOptionalRow kind="email" t={t} value={entity.email} />
            <OverviewOptionalRow kind="tel" t={t} value={entity.phone} />
            <OverviewOptionalRow
              kind="url"
              t={t}
              value={entity.website_contact}
            />
          </div>
        </section>
      ) : null}
    </div>
  );
}

function PeopleCards({
  contactId,
  heading,
  t,
}: {
  contactId: string;
  heading: string;
  t: (k: string) => string;
}) {
  const relationsQuery = useContactRelationsQuery(contactId);
  const personRelations = useMemo(
    () =>
      (relationsQuery.data ?? []).filter(
        (r) => r.other_contact.type === "person"
      ),
    [relationsQuery.data]
  );

  if (relationsQuery.isLoading) {
    return <p className="text-muted-foreground text-sm">{t("loading")}</p>;
  }
  if (personRelations.length === 0) {
    return null;
  }

  return (
    <section className="space-y-3">
      <CardSection.Header title={heading} variant="meta" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {personRelations.map((r) => (
          <ContactPersonCard key={r.id} relation={r} />
        ))}
      </div>
    </section>
  );
}

function PersonAffiliation({
  entity,
  t,
}: {
  entity: ContactListItem;
  t: (k: string) => string;
}) {
  const navigate = useNavigate();
  const relationsQuery = useContactRelationsQuery(entity.id);
  const orgRelations = useMemo(
    () =>
      (relationsQuery.data ?? []).filter(
        (r) => r.other_contact.type === "organisation"
      ),
    [relationsQuery.data]
  );

  if (relationsQuery.isLoading || orgRelations.length === 0) {
    return null;
  }

  const primaryOrg = orgRelations[0];

  return (
    <>
      <section className="space-y-3">
        <CardSection.Header title={t("detail.company")} variant="meta" />
        {orgRelations.map((rel) => {
          const detailLine = [rel.position, rel.department, rel.role]
            .filter(Boolean)
            .join(" · ");
          return (
            <div
              className="group ui-canvas-panel relative flex items-start gap-3 rounded-lg border-0 bg-card p-3 transition-colors hover:bg-accent/40"
              key={rel.id}
            >
              <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted font-semibold text-muted-foreground text-sm">
                {rel.other_contact.display_name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1 space-y-0.5">
                <button
                  className="truncate font-medium text-sm hover:underline"
                  onClick={() =>
                    navigate(`/mdl/contacts/${rel.other_contact.id}`)
                  }
                  type="button"
                >
                  {rel.other_contact.display_name}
                </button>
                {detailLine && (
                  <p className="truncate text-muted-foreground text-xs">
                    {detailLine}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </section>

      <PeopleCards
        contactId={primaryOrg.other_contact.id}
        heading={t("detail.colleagues")}
        t={t}
      />
    </>
  );
}

export function ContactOverviewTab({ entity }: ContactOverviewTabProps) {
  const { t } = useTranslation("contacts");
  const isOrg = entity.type === "organisation";

  return (
    <div className="space-y-8">
      <div className="grid gap-6 md:grid-cols-2">
        {isOrg ? (
          <OrgOverviewLeft entity={entity} t={t} />
        ) : (
          <PersonOverviewLeft entity={entity} t={t} />
        )}

        <div className="space-y-5">
          <section>
            <ContactNotesField
              contactId={entity.id}
              initialValue={entity.notes ?? ""}
            />
          </section>
        </div>
      </div>

      {isOrg ? (
        <PeopleCards contactId={entity.id} heading={t("detail.people")} t={t} />
      ) : (
        <PersonAffiliation entity={entity} t={t} />
      )}
    </div>
  );
}
