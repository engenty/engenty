"use client";

import type {
  ObjectDisplayItem,
  ObjectWidgetCardProps,
  ObjectWidgetPanelProps,
} from "@engenty/ai-ui";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Badge,
  cn,
  Skeleton,
} from "@engenty/ui-core";
import { Building2, ExternalLink, Mail, Phone, User } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useContactDetailQuery } from "../../queries.js";

/**
 * Chat object widget for `contacts:contact:<id>` refs — resolves live data
 * client-side (viewing user's session, so contact authz applies) and renders
 * a single card or a compact list. Snapshot items are the loading/no-access
 * fallback only.
 */

const LIST_INLINE_LIMIT = 10;

function contactInitials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "?";
}

function ContactRow({
  contactId,
  snapshot,
  onOpen,
}: {
  contactId: string;
  snapshot?: ObjectDisplayItem;
  onOpen?: () => void;
}) {
  const { data: contact, isPending, isError } = useContactDetailQuery(contactId);

  if (isPending && !snapshot) {
    return (
      <div className="flex items-center gap-2.5 px-3 py-2">
        <Skeleton className="size-7 rounded-full" />
        <div className="flex-1 space-y-1">
          <Skeleton className="h-3.5 w-40" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
    );
  }

  const name = contact?.display_name ?? snapshot?.title ?? contactId;
  const secondary =
    contact?.email ?? contact?.phone ?? snapshot?.subtitle ?? null;
  const TypeIcon = contact?.type === "organisation" ? Building2 : User;

  return (
    <Link
      className="flex items-center gap-2.5 px-3 py-2 transition-colors hover:bg-muted/50"
      onClick={onOpen ? (event) => {
        event.preventDefault();
        onOpen();
      } : undefined}
      to={`/mdl/contacts/${contactId}`}
    >
      <Avatar className="size-7">
        {contact?.logo_url ? <AvatarImage src={contact.logo_url} /> : null}
        <AvatarFallback className="text-[10px]">
          {contactInitials(name)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-medium text-foreground/90 text-sm">
            {name}
          </span>
          <TypeIcon className="size-3 shrink-0 text-muted-foreground/60" />
        </div>
        {secondary ? (
          <div className="truncate text-muted-foreground text-xs">
            {secondary}
          </div>
        ) : null}
      </div>
      {isError && !contact ? (
        <span className="shrink-0 text-muted-foreground/70 text-xs">
          not available
        </span>
      ) : null}
      {contact?.roles?.length ? (
        <div className="flex shrink-0 gap-1">
          {contact.roles.slice(0, 2).map((role) => (
            <Badge className="text-[10px]" key={role} variant="outline">
              {role}
            </Badge>
          ))}
        </div>
      ) : null}
    </Link>
  );
}

function ContactSingleCard({
  contactId,
  snapshot,
}: {
  contactId: string;
  snapshot?: ObjectDisplayItem;
}) {
  const { data: contact, isPending } = useContactDetailQuery(contactId);

  if (isPending && !snapshot) {
    return (
      <div className="space-y-2 p-3">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-3 w-32" />
      </div>
    );
  }
  const name = contact?.display_name ?? snapshot?.title ?? contactId;
  const TypeIcon = contact?.type === "organisation" ? Building2 : User;

  return (
    <div className="p-3">
      <div className="flex items-start gap-3">
        <Avatar className="size-10">
          {contact?.logo_url ? <AvatarImage src={contact.logo_url} /> : null}
          <AvatarFallback>{contactInitials(name)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-semibold text-foreground text-sm">
              {name}
            </span>
            <TypeIcon className="size-3.5 shrink-0 text-muted-foreground/60" />
          </div>
          <div className="mt-1 space-y-0.5">
            {contact?.email ? (
              <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                <Mail className="size-3 shrink-0" />
                <span className="truncate">{contact.email}</span>
              </div>
            ) : null}
            {contact?.phone ? (
              <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                <Phone className="size-3 shrink-0" />
                <span className="truncate">{contact.phone}</span>
              </div>
            ) : null}
            {!contact && snapshot?.subtitle ? (
              <div className="text-muted-foreground text-xs">
                {snapshot.subtitle}
              </div>
            ) : null}
          </div>
          {contact?.roles?.length ? (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {contact.roles.map((role) => (
                <Badge className="text-[10px]" key={role} variant="outline">
                  {role}
                </Badge>
              ))}
            </div>
          ) : null}
        </div>
        <Link
          className="flex shrink-0 items-center gap-1 text-muted-foreground text-xs transition-colors hover:text-foreground"
          to={`/mdl/contacts/${contactId}`}
        >
          Open
          <ExternalLink className="size-3" />
        </Link>
      </div>
    </div>
  );
}

export function ContactObjectCard({
  refs,
  items,
  provenance,
}: ObjectWidgetCardProps) {
  const itemByRef = new Map((items ?? []).map((item) => [item.ref, item]));
  const snapshotFor = (id: string) =>
    itemByRef.get(`contacts:contact:${id}`);

  const frame = (children: ReactNode) => (
    <div
      className={cn(
        "my-1 w-full overflow-hidden rounded-lg bg-background ring-1 ring-border/60"
      )}
    >
      {children}
    </div>
  );

  if (refs.length === 1) {
    const ref = refs[0];
    return frame(
      <ContactSingleCard contactId={ref.id} snapshot={snapshotFor(ref.id)} />
    );
  }

  const shown = refs.slice(0, LIST_INLINE_LIMIT);
  const overflow = refs.length - shown.length;
  const total = provenance?.total;

  return frame(
    <>
      <div className="divide-y divide-border/50">
        {shown.map((ref) => (
          <ContactRow
            contactId={ref.id}
            key={ref.id}
            snapshot={snapshotFor(ref.id)}
          />
        ))}
      </div>
      {overflow > 0 || (total && total > refs.length) ? (
        <Link
          className="block border-border/50 border-t px-3 py-1.5 text-muted-foreground text-xs transition-colors hover:text-foreground"
          to="/mdl/contacts"
        >
          {overflow > 0 ? `+${overflow} more · ` : ""}
          {total && total > refs.length
            ? `${refs.length} of ${total} — open contacts`
            : "open contacts"}
        </Link>
      ) : null}
    </>
  );
}

export function ContactObjectPanel({ objectRef }: ObjectWidgetPanelProps) {
  return (
    <div className="h-full overflow-y-auto">
      <ContactSingleCard contactId={objectRef.id} />
      <ContactPanelDetails contactId={objectRef.id} />
    </div>
  );
}

function ContactPanelDetails({ contactId }: { contactId: string }) {
  const { data: contact } = useContactDetailQuery(contactId);
  if (!contact) {
    return null;
  }
  const address = [
    contact.address_street,
    [contact.address_zip, contact.address_city].filter(Boolean).join(" "),
    contact.address_country,
  ]
    .filter(Boolean)
    .join(", ");
  const rows: Array<[string, string]> = [
    ...(address ? ([["Address", address]] as Array<[string, string]>) : []),
    ...(contact.vat_id
      ? ([["VAT", contact.vat_id]] as Array<[string, string]>)
      : []),
    ...(contact.website_contact
      ? ([["Website", contact.website_contact]] as Array<[string, string]>)
      : []),
    ...(contact.notes
      ? ([["Notes", contact.notes]] as Array<[string, string]>)
      : []),
  ];
  if (rows.length === 0) {
    return null;
  }
  return (
    <dl className="space-y-2 px-3 pb-3">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt className="text-muted-foreground text-xs">{label}</dt>
          <dd className="text-foreground/90 text-sm">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
