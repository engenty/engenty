import {
  type CommercialBlock,
  calculateTotals,
} from "@engenty/commercial-editor";
import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  Skeleton,
  TopbarActionLabel,
  topbarIconButtonClassName,
} from "@engenty/ui-core";
import { AnimatedDownloadIcon } from "@engenty/ui-icons";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { OfferBillingPlan, OfferBlock, OfferListItem } from "../api.js";
import { ClientTopline } from "../components/client-topline.js";
import { DocumentHeader } from "../components/document-header.js";
import { DocumentTitle } from "../components/document-title.js";
import { OfferAcceptedState } from "../components/offer-accepted-state.js";
import { OfferReadyState } from "../components/offer-ready-state.js";
import { OfferStatusBadge } from "../components/offer-status-badge.js";
import { OfferStatusStepper } from "../components/offer-status-stepper.js";
import { useOffersDetailAgentUiSlice } from "../hooks/use-offers-agent-ui-slice.js";
import { useOffersModuleSecondaryShellNav } from "../hooks/use-offers-module-secondary-shell-nav.js";
import { saveOfferPdf } from "../lib/offer-pdf.js";
import { useScrollCollapse } from "../lib/use-scroll-collapse.js";
import { getContactsPluginApi, getProjectsPluginApi } from "../plugins.js";
import {
  useCreateOfferVersionMutation,
  useOfferDetailContactsQuery,
  useOfferDetailPageQuery,
  useOfferVersionsQuery,
  useUpdateOfferMutation,
} from "../queries.js";
import { OfferEditPage } from "./offer-edit-page.js";

function toCommercialBlocks(blocks: OfferBlock[]): CommercialBlock[] {
  return blocks.map((block) => ({
    id: block.id,
    type: block.type,
    content: block.content_json,
    order_index: block.order_index,
  }));
}

/**
 * The offer, as a page or embedded in a host pane.
 *
 * `embedded` suppresses what is route-shaped or duplicated by the host frame:
 * the id arrives as a prop, the draft redirect stays put (it would eject the
 * reader from the pane they opened), the module's secondary nav stays out of
 * the host's column, and the `DocumentHeader` gives way — the offer's name is
 * on the node the reader clicked. The topbar keeps its breadcrumb and the PDF
 * action, which are the way back out to the full document.
 *
 * **The phase still picks the view.** Suppressing the redirect must not mean
 * showing the wrong thing: a draft renders the DRAFT EDITOR here, the same
 * component the redirect would have landed on.
 */
export function OfferDetailPage(props?: {
  embedded?: boolean;
  offerId?: string;
}) {
  const embedded = props?.embedded ?? false;
  const { t } = useTranslation("offers");
  const navigate = useNavigate();
  const routeParams = useParams<{ id: string }>();
  const id = props?.offerId ?? routeParams.id;
  const contactsPlugin = getContactsPluginApi();
  const projectsPlugin = getProjectsPluginApi();

  const { data, isLoading: loading } = useOfferDetailPageQuery(id ?? null);
  const { data: entities = [] } = useOfferDetailContactsQuery(contactsPlugin);
  const { data: versions = [] } = useOfferVersionsQuery(id ?? null);
  const updateMutation = useUpdateOfferMutation(id ?? "");
  const createVersionMutation = useCreateOfferVersionMutation();
  const [actionBusy, setActionBusy] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const {
    collapsed: headerCollapsed,
    onScroll,
    scrollRef,
  } = useScrollCollapse();

  const offer = data?.offer ?? null;
  const blocks = useMemo(
    () => toCommercialBlocks(data?.blocks ?? []),
    [data?.blocks]
  );

  useEffect(() => {
    // Embedded, the host owns the URL: redirecting a draft would navigate the
    // reader out of the pane they opened it in.
    if (!embedded && offer?.status === "draft") {
      navigate(`/mdl/offers/${offer.id}/draft`, { replace: true });
    }
  }, [embedded, offer?.id, offer?.status, navigate]);

  const totals = useMemo(
    () => calculateTotals(blocks, offer?.default_tax_rate ?? 20),
    [blocks, offer?.default_tax_rate]
  );
  const positionCount = blocks.filter((b) => b.type === "line_item").length;
  const blockCount = blocks.length - positionCount;

  const clientName = offer?.client_id
    ? (entities.find((e) => e.id === offer.client_id)?.display_name ??
      offer.recipient_name ??
      "—")
    : (offer?.recipient_name ?? "—");
  const clientContactName = offer?.client_id
    ? (entities.find((e) => e.id === offer.client_id)?.contact_name ?? null)
    : null;

  const { moduleRootCrumb, secondaryNavAfterItems, secondaryNavHeaderSlot } =
    useOffersModuleSecondaryShellNav();

  const breadcrumbs = useMemo(
    () => [
      ...(moduleRootCrumb ? [moduleRootCrumb] : []),
      { label: offer?.title ?? t("detail") },
    ],
    [moduleRootCrumb, offer?.title, t]
  );
  const actions = useMemo(
    () => (
      <Button
        className={topbarIconButtonClassName}
        disabled={downloadingPdf || !id}
        onClick={async () => {
          if (!id) {
            return;
          }
          setDownloadingPdf(true);
          try {
            await saveOfferPdf(id, `${offer?.offer_number ?? "offer"}.pdf`);
          } finally {
            setDownloadingPdf(false);
          }
        }}
        size="sm"
        variant="outline"
      >
        <AnimatedDownloadIcon
          className="mr-1.5"
          play={downloadingPdf ? "always" : "hover"}
          size="sm"
        />
        <TopbarActionLabel>{t("downloadPdf")}</TopbarActionLabel>
      </Button>
    ),
    [downloadingPdf, id, offer?.offer_number, t]
  );
  usePageConfig({
    actions,
    breadcrumbs,
    contentStackBackground: "paper",
    // Embedded: the host owns the secondary column, and there is no
    // DocumentHeader for a transparent topbar to blend into or float over.
    ...(embedded
      ? {}
      : {
          secondaryNavAfterItems,
          secondaryNavHeaderSlot,
          // Float the transparent topbar over the white DocumentHeader.
          topbarOverlap: true,
        }),
  });
  useOffersDetailAgentUiSlice(offer);

  const runAction = async (fn: () => Promise<unknown> | unknown) => {
    setActionBusy(true);
    try {
      await fn();
    } finally {
      setActionBusy(false);
    }
  };

  const handleCreateVersion = () =>
    runAction(async () => {
      if (!id) {
        return;
      }
      const created = await createVersionMutation.mutateAsync(id);
      navigate(`/mdl/offers/${created.id}/draft`);
    });

  const handleCreateProject = () =>
    runAction(async () => {
      if (!(offer && projectsPlugin)) {
        return;
      }
      const created = await projectsPlugin.createProject({
        title: offer.title,
        client_id: offer.client_id,
        client_name: offer.recipient_name ?? clientName,
        lead_id: offer.lead_id,
      });
      updateMutation.mutate({ project_id: created.id });
      navigate(`/mdl/projects/${created.id}`);
    });

  if (loading || !offer) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {embedded ? null : (
          <DocumentHeader>
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-8 w-full max-w-md" />
          </DocumentHeader>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <section className="mx-auto w-full max-w-5xl space-y-4 p-page">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-64 w-full" />
          </section>
        </div>
      </div>
    );
  }

  // The phase picks the view, exactly as the route does — a draft's route
  // redirects to the editor, so embedded a draft IS the editor. Rendering the
  // ready state instead would announce "Approved" over an unapproved offer.
  if (embedded && offer.status === "draft") {
    return <OfferEditPage embedded offerId={offer.id} />;
  }

  const summaryProps = {
    blockCount,
    companyName: clientName ?? "—",
    contactName: clientContactName,
    gross: totals.gross,
    net: totals.net,
    offer,
    positionCount,
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {embedded ? null : (
        <DocumentHeader
          collapsed={headerCollapsed}
          compactStatus={<OfferStatusBadge status={offer.status} />}
          compactTitle={offer.title || t("offerTitle")}
        >
          <ClientTopline
            clientId={contactsPlugin ? offer.client_id : null}
            clientName={clientName ?? undefined}
            showChangeClient={false}
            showLinkToClient={Boolean(contactsPlugin)}
          />
          <DocumentTitle
            onChange={(title) =>
              updateMutation.mutate({ title } as Partial<OfferListItem>)
            }
            placeholder={t("offerTitle")}
            value={offer.title}
          />
          <OfferStatusStepper status={offer.status} />
        </DocumentHeader>
      )}

      <div
        className="min-h-0 flex-1 overflow-y-auto"
        onScroll={onScroll}
        ref={scrollRef}
      >
        {offer.status === "accepted" ? (
          <OfferAcceptedState
            {...summaryProps}
            busy={actionBusy}
            canCreateProject={Boolean(projectsPlugin)}
            onCreateProject={handleCreateProject}
            onMarkSigned={() =>
              updateMutation.mutate({
                contract_signed_at: new Date().toISOString(),
              })
            }
            onOpenProject={() =>
              navigate(`/mdl/projects/${offer.project_id ?? ""}`)
            }
            onOpenVersion={(versionId) => navigate(`/mdl/offers/${versionId}`)}
            onSaveBillingPlan={(plan: OfferBillingPlan) =>
              updateMutation.mutate({ billing_plan: plan })
            }
            onSaveContractNotes={(value) =>
              updateMutation.mutate({ contract_notes: value })
            }
            onUploadContractFile={(fileName) =>
              updateMutation.mutate({ contract_file_path: fileName })
            }
            versions={versions}
          />
        ) : (
          <OfferReadyState
            {...summaryProps}
            busy={actionBusy}
            onCreateVersion={handleCreateVersion}
            onMarkAccepted={() => updateMutation.mutate({ status: "accepted" })}
            onMarkSent={() =>
              updateMutation.mutate({ sent_at: new Date().toISOString() })
            }
            onOpenVersion={(versionId) => navigate(`/mdl/offers/${versionId}`)}
            onReopenDraft={() =>
              runAction(async () => {
                await updateMutation.mutateAsync({ status: "draft" });
                navigate(`/mdl/offers/${offer.id}/draft`);
              })
            }
            onSaveInternalNotes={(value) =>
              updateMutation.mutate({ internal_notes: value })
            }
            versions={versions}
          />
        )}
      </div>
    </div>
  );
}
