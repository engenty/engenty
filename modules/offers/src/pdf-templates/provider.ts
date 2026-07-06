import {
  createDefaultPdfTemplateSettings,
  type PdfTemplateHelpSection,
  registerPdfTemplateServerProvider,
  registerPdfTemplateUiProvider,
} from "@engenty/pdf-templates/core";
import {
  createPluginServerGatewayCaller,
  type PluginServerApi,
} from "@engenty/plugin-sdk";
import { z } from "zod";
import {
  getOffers,
  type OfferBlock,
  type OfferListItem,
} from "../../ui/api.js";
import { createOfferRepoSupabase } from "../dal/supabase.js";
import { buildOfferTemplateData } from "./offerToTemplateData.js";
import { offerContentBlock } from "./template-parts.js";

const offersPdfTemplateSettings = createDefaultPdfTemplateSettings();

const offerPdfTemplateInputSchema = z.object({
  offer: z.object({
    id: z.string(),
    offer_number: z.string(),
    title: z.string(),
    introduction: z.string().nullable(),
    final_notes: z.string().nullable(),
    created_at: z.string(),
    valid_until: z.string(),
    reference: z.string().nullable(),
    timeframe_from: z.string().nullable(),
    timeframe_until: z.string().nullable(),
  }),
  recipient: z.record(z.string(), z.unknown()),
  sender: z.record(z.string(), z.unknown()),
  content: z.array(z.record(z.string(), z.unknown())),
  totals: z.object({
    subtotal: z.number(),
    taxAmount: z.number(),
    total: z.number(),
    currency: z.string(),
    subtotal_formatted: z.string(),
    taxAmount_formatted: z.string(),
    total_formatted: z.string(),
    taxes: z.array(z.record(z.string(), z.unknown())),
    show_taxes: z.boolean(),
    no_tax_reason: z.string().nullable().optional(),
    phase_totals: z.array(z.record(z.string(), z.unknown())),
    show_phase_totals: z.boolean(),
  }),
  config: z.object({
    phase_numbering_format: z.string(),
    show_phase_subtotals: z.boolean(),
    show_tax_per_item: z.boolean(),
    show_phase_totals: z.boolean(),
  }),
  settings: z.record(z.string(), z.unknown()).optional(),
  theme: z.record(z.string(), z.unknown()).optional(),
});

function buildOfferTemplatePayload(params: {
  blocks: OfferBlock[];
  commercialSettings: Record<string, unknown> | null;
  companyProfile: Record<string, unknown> | null;
  offer: OfferListItem;
}) {
  return buildOfferTemplateData({
    blocks: params.blocks,
    offer: params.offer,
    companyProfile: params.companyProfile,
    commercialSettings: params.commercialSettings,
  });
}

export const defaultOfferPdfTemplate = `<Document>
  <Page size="A4" style="page">
    {% if settings.letterhead.asset_url %}
      <Image style="letterheadImage" src="{{ settings.letterhead.asset_url }}" />
    {% endif %}

    <View style="headerRow">
      <View style="partyColumn">
        <Text style="smallLabel">EMPFÄNGER</Text>
        <Text style="strongText">{{ recipient.company_name }}</Text>
        {% if recipient.address_full %}<Text style="bodyText">{{ recipient.address_full }}</Text>{% endif %}
        {% if recipient.show_contact_name and recipient.contact_name %}<Text style="bodyText text-muted">{{ recipient.contact_name }}</Text>{% endif %}
        {% if recipient.show_contact_email and recipient.email %}<Text style="bodyText text-muted">{{ recipient.email }}</Text>{% endif %}
        {% if recipient.custom_info %}<Text style="bodyText">{{ recipient.custom_info }}</Text>{% endif %}
      </View>
      <View style="partyColumnRight">
        {% if sender.logo_url %}<Image style="senderLogo" src="{{ sender.logo_url }}" />{% endif %}
        <Text style="strongText text-accent">{{ sender.company_name }}</Text>
        {% if sender.address_full %}<Text style="bodyText">{{ sender.address_full }}</Text>{% endif %}
        {% if sender.email %}<Text style="bodyText">{{ sender.email }}</Text>{% endif %}
      </View>
    </View>

    <View style="metaRow">
      <View style="metaCol"><Text style="metaLabel">Angebotsnummer</Text><Text style="metaValue">{{ offer.offer_number }}</Text></View>
      <View style="metaCol"><Text style="metaLabel">Angebotsdatum</Text><Text style="metaValue">{{ offer.created_at }}</Text></View>
      <View style="metaCol"><Text style="metaLabel">Gültig bis</Text><Text style="metaValue">{{ offer.valid_until }}</Text></View>
      <View style="metaCol"><Text style="metaLabel">Ihre Referenz</Text><Text style="metaValue">{{ offer.reference | default: "—" }}</Text></View>
    </View>

    <Text style="title">{{ offer.title }}</Text>
    {% if offer.introduction %}<View style="introBlock"><Text style="bodyText">{{ offer.introduction }}</Text></View>{% endif %}

    ${offerContentBlock}

    {% assign phase_totals_count = totals.phase_totals | size %}
    {% if totals.show_phase_totals and phase_totals_count > 0 %}
      <View style="phaseTotalsSection">
        <Text style="sectionTitle">Phasenübersicht</Text>
        {% for phase in totals.phase_totals %}
          <View style="phaseTotalRow">
            <Text style="totalLabel">{{ phase.label }}</Text>
            <Text style="phaseTotalValue">{{ phase.subtotal_formatted }}</Text>
          </View>
        {% endfor %}
      </View>
    {% endif %}

    <View style="totalsSection">
      <View style="totalRow">
        <Text style="totalLabel">Netto:</Text>
        <Text style="totalValue">{{ totals.subtotal_formatted }}</Text>
      </View>
      {% if totals.show_taxes %}
        {% for tax in totals.taxes %}
          <View style="totalRow">
            <Text style="totalLabel">Steuer {{ tax.rate_formatted }}:</Text>
            <Text style="totalValue">{{ tax.amount_formatted }}</Text>
          </View>
        {% endfor %}
      {% elsif totals.no_tax_reason %}
        <View style="totalRow">
          <Text style="totalLabel muted">{{ totals.no_tax_reason }}</Text>
        </View>
      {% endif %}
      <View style="grandTotalRow">
        <Text style="grandTotalLabel">Brutto:</Text>
        <Text style="grandTotalValue">{{ totals.total_formatted }}</Text>
      </View>
    </View>

    {% if offer.final_notes %}<View style="finalNotesBlock"><Text style="bodyText">{{ offer.final_notes }}</Text></View>{% endif %}

    <View style="footerBlock">
      <Text style="footerText">{{ sender.company_name }}</Text>
      {% if sender.address_full %}<Text style="footerText">{{ sender.address_full }}</Text>{% endif %}
      {% if sender.vat_id %}<Text style="footerText">UID-Nr. {{ sender.vat_id }}</Text>{% endif %}
      {% if sender.iban %}<Text style="footerText">IBAN {{ sender.iban }}</Text>{% endif %}
      {% if sender.bic %}<Text style="footerText">BIC {{ sender.bic }}</Text>{% endif %}
    </View>
  </Page>
</Document>`;

export const defaultOfferPdfStylesheet = `{
  "page": {
    "paddingTop": "{{ settings.margins.top }}",
    "paddingRight": "{{ settings.margins.right }}",
    "paddingBottom": "{{ settings.margins.bottom }}",
    "paddingLeft": "{{ settings.margins.left }}",
    "fontFamily": "{{ settings.typography.text.family }}",
    "fontSize": "{{ settings.base_font_size }}",
    "backgroundColor": "{{ settings.colors.backgrounds.page }}",
    "color": "{{ settings.colors.text }}"
  },
  "letterheadImage": {
    "width": "120pt",
    "height": "72pt",
    "objectFit": "{{ settings.letterhead.fit }}"
  },
  "headerRow": {
    "flexDirection": "row",
    "justifyContent": "space-between",
    "marginBottom": "20pt"
  },
  "partyColumn": { "width": "48%" },
  "partyColumnRight": { "width": "48%", "alignSelf": "flex-end", "alignItems": "flex-end" },
  "senderLogo": { "width": "96pt", "height": "48pt", "objectFit": "contain", "marginBottom": "8pt" },
  "smallLabel": {
    "fontFamily": "{{ settings.typography.small.family }}",
    "fontSize": "{{ settings.typography.small.size }}",
    "fontWeight": {{ settings.typography.small.weight }},
    "color": "{{ settings.colors.muted }}",
    "marginBottom": "4pt",
    "textTransform": "uppercase"
  },
  "strongText": {
    "fontFamily": "{{ settings.typography.headlines.family }}",
    "fontSize": "{{ settings.typography.text.size }}",
    "fontWeight": {{ settings.typography.headlines.weight }},
    "marginBottom": "2pt"
  },
  "text-accent": { "color": "{{ settings.colors.accent }}" },
  "text-muted": { "color": "{{ settings.colors.muted }}" },
  "muted": { "color": "{{ settings.colors.muted }}", "fontStyle": "italic" },
  "metaRow": { "flexDirection": "row", "justifyContent": "space-between", "marginBottom": "16pt", "paddingTop": "16pt", "paddingBottom": "8pt", "borderBottomWidth": 1, "borderBottomColor": "{{ settings.colors.lines }}" },
  "metaCol": { "flex": 1 },
  "metaLabel": {
    "fontFamily": "{{ settings.typography.small.family }}",
    "fontSize": "{{ settings.typography.small.size }}",
    "fontWeight": 700,
    "color": "{{ settings.colors.accent }}",
    "marginBottom": "2pt"
  },
  "metaValue": { "fontSize": "{{ settings.typography.text.size }}" },
  "title": {
    "fontFamily": "{{ settings.typography.title.family }}",
    "fontSize": "{{ settings.typography.title.size }}",
    "fontWeight": {{ settings.typography.title.weight }},
    "color": "{{ settings.colors.accent }}",
    "marginBottom": "12pt"
  },
  "introBlock": { "marginBottom": "16pt" },
  "sectionTitle": {
    "fontFamily": "{{ settings.typography.headlines.family }}",
    "fontSize": "{{ settings.typography.headlines.size }}",
    "fontWeight": {{ settings.typography.headlines.weight }},
    "marginTop": "12pt",
    "marginBottom": "8pt"
  },
  "subSectionTitle": {
    "fontFamily": "{{ settings.typography.headlines.family }}",
    "fontSize": "{{ settings.typography.text.size }}",
    "fontWeight": 600,
    "marginBottom": "8pt"
  },
  "bodyText": {
    "fontFamily": "{{ settings.typography.text.family }}",
    "fontSize": "{{ settings.typography.text.size }}",
    "fontWeight": {{ settings.typography.text.weight }},
    "lineHeight": 1.4,
    "marginBottom": "6pt"
  },
  "bundleTitle": {
    "fontFamily": "{{ settings.typography.text.family }}",
    "fontSize": "{{ settings.typography.text.size }}",
    "fontWeight": 700,
    "marginTop": "12pt",
    "marginBottom": "4pt"
  },
  "tableRow": { "flexDirection": "row", "fontSize": "{{ settings.typography.text.size }}" },
  "posColHeader": { "width": "32pt", "paddingVertical": "8pt", "paddingRight": "4pt", "fontWeight": 600, "borderTopWidth": 1, "borderBottomWidth": 1, "borderColor": "{{ settings.colors.lines }}" },
  "bezeichnungColHeader": { "flex": 1, "paddingVertical": "8pt", "paddingRight": "4pt", "fontWeight": 600, "borderTopWidth": 1, "borderBottomWidth": 1, "borderColor": "{{ settings.colors.lines }}" },
  "mengeColHeader": { "width": "72pt", "paddingVertical": "8pt", "paddingHorizontal": "4pt", "fontWeight": 600, "borderTopWidth": 1, "borderBottomWidth": 1, "borderColor": "{{ settings.colors.lines }}" },
  "preisColHeader": { "width": "72pt", "paddingVertical": "8pt", "paddingRight": "4pt", "fontWeight": 600, "textAlign": "right", "borderTopWidth": 1, "borderBottomWidth": 1, "borderColor": "{{ settings.colors.lines }}" },
  "ustColHeader": { "width": "48pt", "paddingVertical": "8pt", "paddingRight": "4pt", "fontWeight": 600, "textAlign": "right", "borderTopWidth": 1, "borderBottomWidth": 1, "borderColor": "{{ settings.colors.lines }}" },
  "summeColHeader": { "width": "72pt", "paddingVertical": "8pt", "paddingRight": "4pt", "fontWeight": 600, "textAlign": "right", "borderTopWidth": 1, "borderBottomWidth": 1, "borderColor": "{{ settings.colors.lines }}" },
  "posCol": { "width": "32pt", "paddingVertical": "8pt", "paddingRight": "4pt", "borderTopWidth": 1, "borderColor": "{{ settings.colors.lines }}" },
  "posColMuted": { "color": "{{ settings.colors.muted }}" },
  "bezeichnungCol": { "flex": 1, "paddingVertical": "8pt", "paddingRight": "4pt", "borderTopWidth": 1, "borderColor": "{{ settings.colors.lines }}" },
  "mengeCol": { "width": "72pt", "paddingVertical": "8pt", "paddingHorizontal": "4pt", "borderTopWidth": 1, "borderColor": "{{ settings.colors.lines }}" },
  "preisCol": { "width": "72pt", "paddingVertical": "8pt", "paddingRight": "4pt", "textAlign": "right", "borderTopWidth": 1, "borderColor": "{{ settings.colors.lines }}" },
  "ustCol": { "width": "48pt", "paddingVertical": "8pt", "paddingRight": "4pt", "textAlign": "right", "borderTopWidth": 1, "borderColor": "{{ settings.colors.lines }}" },
  "summeCol": { "width": "72pt", "paddingVertical": "8pt", "paddingRight": "4pt", "textAlign": "right", "borderTopWidth": 1, "borderColor": "{{ settings.colors.lines }}" },
  "cellTextBold": { "fontWeight": 600 },
  "cellTextSemibold": { "fontWeight": 600 },
  "cellContentMuted": { "marginTop": "2pt", "fontSize": "10", "color": "{{ settings.colors.muted }}" },
  "pageBreak": {},
  "phaseTotalsSection": { "marginTop": "24pt" },
  "phaseTotalRow": { "flexDirection": "row", "justifyContent": "space-between", "paddingVertical": "4pt" },
  "phaseTotalValue": { "fontWeight": 500 },
  "totalsSection": {
    "borderTopWidth": 1,
    "borderTopColor": "{{ settings.colors.lines }}",
    "marginTop": "24pt",
    "paddingTop": "12pt"
  },
  "totalRow": { "flexDirection": "row", "justifyContent": "flex-end", "paddingVertical": "4pt", "fontSize": "11" },
  "totalLabel": { "textAlign": "right", "color": "{{ settings.colors.muted }}" },
  "totalValue": { "width": "96pt", "textAlign": "right", "fontWeight": 500 },
  "grandTotalRow": { "flexDirection": "row", "justifyContent": "flex-end", "paddingTop": "8pt", "marginTop": "8pt", "borderTopWidth": 1, "borderTopColor": "{{ settings.colors.lines }}" },
  "grandTotalLabel": { "textAlign": "right", "fontWeight": 700 },
  "grandTotalValue": { "width": "96pt", "textAlign": "right", "fontWeight": 700, "color": "{{ settings.colors.accent }}" },
  "subtotalRow": { "flexDirection": "row", "justifyContent": "flex-end", "marginTop": "8pt", "paddingTop": "6pt", "borderTopWidth": 1, "borderTopColor": "{{ settings.colors.lines }}", "fontSize": "{{ settings.typography.text.size }}" },
  "subtotalLabel": { "textAlign": "right", "color": "{{ settings.colors.muted }}" },
  "subtotalValue": { "width": "96pt", "textAlign": "right", "fontWeight": 500 },
  "finalNotesBlock": { "marginTop": "24pt" },
  "footerBlock": {
    "marginTop": "32pt",
    "paddingTop": "12pt",
    "borderTopWidth": 1,
    "borderTopColor": "{{ settings.colors.lines }}",
    "flexDirection": "row",
    "flexWrap": "wrap",
    "gap": "16pt"
  },
  "footerText": {
    "fontSize": "9",
    "color": "{{ settings.colors.muted }}",
    "width": "100%"
  }
}`;

export const offerPdfTemplateHelpSections: PdfTemplateHelpSection[] = [
  {
    title: "Available data",
    description:
      "Offers templates receive structured offer, recipient, sender, content, totals, settings, and theme objects.",
    code: "{{ offer.title }}\n{{ recipient.name }}\n{{ totals.total_formatted }}",
  },
  {
    title: "Liquid control flow",
    description:
      "Use Liquid conditions and loops for optional blocks and line items.",
    code: "{% if offer.reference %}<Text>{{ offer.reference }}</Text>{% endif %}\n{% for group in content %}<Text>{{ group.type }}</Text>{% endfor %}",
  },
  {
    title: "Settings-driven styles",
    description:
      "Stylesheet JSON can reference the editable design settings to keep documents themeable.",
    code: '"color": "{{ settings.colors.accent }}"\n"fontFamily": "{{ settings.typography.text.family }}"',
  },
];

export function registerOffersPdfTemplateUiProvider() {
  registerPdfTemplateUiProvider({
    moduleKey: "offers",
    label: "Offers",
    labelKey: "offers:menu.offers",
    settingsDefaults: offersPdfTemplateSettings,
    defaultDocumentTemplate: defaultOfferPdfTemplate,
    defaultStylesheetTemplate: defaultOfferPdfStylesheet,
    inputSchema: offerPdfTemplateInputSchema,
    getHelpSections: () => offerPdfTemplateHelpSections,
    listPreviewRecords: async (signal) => {
      const result = await getOffers({ pageSize: 100 }, signal);
      return result.data.map((offer) => ({
        id: offer.id,
        label: `${offer.offer_number} ${offer.title}`.trim(),
      }));
    },
  });
}

export function registerOffersPdfTemplateServerProvider(
  server: PluginServerApi
) {
  const { invokeOperation } = createPluginServerGatewayCaller(server);
  registerPdfTemplateServerProvider({
    moduleKey: "offers",
    settingsDefaults: offersPdfTemplateSettings,
    defaultDocumentTemplate: defaultOfferPdfTemplate,
    defaultStylesheetTemplate: defaultOfferPdfStylesheet,
    inputSchema: offerPdfTemplateInputSchema,
    buildSampleData: async () =>
      buildOfferTemplatePayload({
        offer: {
          id: "sample-offer",
          tenant_id: "sample-tenant",
          scope_id: "sample-scope",
          template_id: null,
          client_id: null,
          lead_id: null,
          sent_at: null,
          title: "Website Relaunch & E-Commerce Integration",
          offer_number: "ANG-2025-0042",
          status: "draft",
          reference: null,
          offer_date: "2025-12-30",
          valid_until: "2026-01-30",
          introduction:
            "Vielen Dank für Ihr Interesse an unseren Leistungen. Gerne unterbreiten wir Ihnen folgendes Angebot für die Umsetzung Ihres Projekts.",
          final_notes:
            "Wir freuen uns auf eine erfolgreiche Zusammenarbeit und stehen Ihnen für Rückfragen jederzeit gerne zur Verfügung.",
          currency: "EUR",
          recipient_name: "Mustermann GmbH",
          recipient_address: "Musterstraße 123, 10115 Berlin, Deutschland",
          recipient_email: "max@mustermann.de",
          recipient_custom_info: null,
          show_contact_name: true,
          show_contact_email: true,
          billing_type: "fixed_price",
          billing_interval: null,
          retainer_amount: null,
          spillover_rules: null,
          allows_fixed_positions: true,
          usage_based: false,
          default_tax_rate: 20,
          show_tax_per_item: true,
          no_tax_reason: null,
          phases_enabled: true,
          show_phase_index: true,
          phase_index_pattern: "1.",
          show_phase_totals: true,
          metadata_json: {},
          settings_json: {},
          internal_notes: null,
          approved_at: null,
          approved_by_name: null,
          accepted_at: null,
          project_id: null,
          contract_signed_at: null,
          contract_notes: null,
          contract_file_path: null,
          version_number: 1,
          parent_offer_id: null,
          billing_plan: null,
          created_by: null,
          created_at: "2026-03-20T00:00:00.000Z",
          updated_at: "2026-03-20T00:00:00.000Z",
        },
        blocks: [
          {
            id: "phase-1",
            offer_id: "sample-offer",
            tenant_id: "sample-tenant",
            scope_id: "sample-scope",
            type: "phase",
            content_json: {
              title: "Strategie & Konzept",
              content: "Analyse der Ziele, Zielgruppen und des Projektumfangs.",
              is_phase: true,
              billing_type: "fixed_price",
              timeframe_from: "2026-02-01",
              timeframe_until: "2026-02-15",
            },
            order_index: 0,
            created_at: "2026-03-20T00:00:00.000Z",
            updated_at: "2026-03-20T00:00:00.000Z",
          },
          {
            id: "sub-1",
            offer_id: "sample-offer",
            tenant_id: "sample-tenant",
            scope_id: "sample-scope",
            type: "subheading",
            content_json: { title: "Recherche & Workshop" },
            order_index: 1,
            created_at: "2026-03-20T00:00:00.000Z",
            updated_at: "2026-03-20T00:00:00.000Z",
          },
          {
            id: "text-1",
            offer_id: "sample-offer",
            tenant_id: "sample-tenant",
            scope_id: "sample-scope",
            type: "text",
            content_json: {
              content:
                "Workshops, Stakeholder-Interviews und Wettbewerbsanalyse.",
            },
            order_index: 2,
            created_at: "2026-03-20T00:00:00.000Z",
            updated_at: "2026-03-20T00:00:00.000Z",
          },
          {
            id: "bundle-1",
            offer_id: "sample-offer",
            tenant_id: "sample-tenant",
            scope_id: "sample-scope",
            type: "line_item",
            content_json: {
              title: "Research Paket",
              content: "Audit, Analyse und Priorisierung der Inhalte.",
              amount: 1,
              unit: "h",
              cost_per_item: 0,
              tax: 20,
              item_total: 0,
              line_item_subtype: "headline",
            },
            order_index: 3,
            created_at: "2026-03-20T00:00:00.000Z",
            updated_at: "2026-03-20T00:00:00.000Z",
          },
          {
            id: "item-1-1",
            offer_id: "sample-offer",
            tenant_id: "sample-tenant",
            scope_id: "sample-scope",
            type: "line_item",
            content_json: {
              title: "Art Direction",
              amount: 6,
              unit: "h",
              cost_per_item: 150,
              tax: 20,
              item_total: 900,
              parent_id: "bundle-1",
              line_item_subtype: "position",
            },
            order_index: 4,
            created_at: "2026-03-20T00:00:00.000Z",
            updated_at: "2026-03-20T00:00:00.000Z",
          },
          {
            id: "item-1-2",
            offer_id: "sample-offer",
            tenant_id: "sample-tenant",
            scope_id: "sample-scope",
            type: "line_item",
            content_json: {
              title: "Project Management",
              amount: 4,
              unit: "h",
              cost_per_item: 150,
              tax: 20,
              item_total: 600,
              parent_id: "bundle-1",
              line_item_subtype: "position",
            },
            order_index: 5,
            created_at: "2026-03-20T00:00:00.000Z",
            updated_at: "2026-03-20T00:00:00.000Z",
          },
          {
            id: "bundle-2",
            offer_id: "sample-offer",
            tenant_id: "sample-tenant",
            scope_id: "sample-scope",
            type: "line_item",
            content_json: {
              title: "Workshop Paket",
              content: "Anforderungen und KPIs gemeinsam definieren.",
              amount: 1,
              unit: "h",
              cost_per_item: 0,
              tax: 20,
              item_total: 0,
              line_item_subtype: "headline",
            },
            order_index: 6,
            created_at: "2026-03-20T00:00:00.000Z",
            updated_at: "2026-03-20T00:00:00.000Z",
          },
          {
            id: "item-2-1",
            offer_id: "sample-offer",
            tenant_id: "sample-tenant",
            scope_id: "sample-scope",
            type: "line_item",
            content_json: {
              title: "Design Workshop",
              amount: 10,
              unit: "h",
              cost_per_item: 150,
              tax: 20,
              item_total: 1500,
              parent_id: "bundle-2",
              line_item_subtype: "position",
            },
            order_index: 7,
            created_at: "2026-03-20T00:00:00.000Z",
            updated_at: "2026-03-20T00:00:00.000Z",
          },
          {
            id: "item-2-2",
            offer_id: "sample-offer",
            tenant_id: "sample-tenant",
            scope_id: "sample-scope",
            type: "line_item",
            content_json: {
              title: "Konzept Review",
              amount: 2,
              unit: "h",
              cost_per_item: 150,
              tax: 20,
              item_total: 300,
              parent_id: "bundle-2",
              line_item_subtype: "position",
            },
            order_index: 8,
            created_at: "2026-03-20T00:00:00.000Z",
            updated_at: "2026-03-20T00:00:00.000Z",
          },
          {
            id: "item-3",
            offer_id: "sample-offer",
            tenant_id: "sample-tenant",
            scope_id: "sample-scope",
            type: "line_item",
            content_json: {
              title: "Lizenzkosten Bildmaterial",
              amount: 1,
              unit: "fixed",
              cost_per_item: 300,
              tax: 20,
              item_total: 300,
              line_item_subtype: "position",
            },
            order_index: 9,
            created_at: "2026-03-20T00:00:00.000Z",
            updated_at: "2026-03-20T00:00:00.000Z",
          },
          {
            id: "phase-2",
            offer_id: "sample-offer",
            tenant_id: "sample-tenant",
            scope_id: "sample-scope",
            type: "phase",
            content_json: {
              title: "Entwicklung & QA",
              content: "Technische Umsetzung, Testing und Qualitätssicherung.",
              is_phase: true,
              billing_type: "time_and_materials",
              timeframe_from: "2026-02-16",
              timeframe_until: "2026-04-30",
            },
            order_index: 10,
            created_at: "2026-03-20T00:00:00.000Z",
            updated_at: "2026-03-20T00:00:00.000Z",
          },
          {
            id: "sub-2",
            offer_id: "sample-offer",
            tenant_id: "sample-tenant",
            scope_id: "sample-scope",
            type: "subheading",
            content_json: { title: "Implementierung" },
            order_index: 11,
            created_at: "2026-03-20T00:00:00.000Z",
            updated_at: "2026-03-20T00:00:00.000Z",
          },
          {
            id: "item-4",
            offer_id: "sample-offer",
            tenant_id: "sample-tenant",
            scope_id: "sample-scope",
            type: "line_item",
            content_json: {
              title: "Wireframes Desktop & Mobile",
              amount: 12,
              unit: "h",
              cost_per_item: 120,
              tax: 20,
              item_total: 1440,
              line_item_subtype: "position",
            },
            order_index: 12,
            created_at: "2026-03-20T00:00:00.000Z",
            updated_at: "2026-03-20T00:00:00.000Z",
          },
          {
            id: "item-5",
            offer_id: "sample-offer",
            tenant_id: "sample-tenant",
            scope_id: "sample-scope",
            type: "line_item",
            content_json: {
              title: "UI Design & Mockups",
              amount: 20,
              unit: "h",
              cost_per_item: 120,
              tax: 20,
              item_total: 2400,
              line_item_subtype: "position",
            },
            order_index: 13,
            created_at: "2026-03-20T00:00:00.000Z",
            updated_at: "2026-03-20T00:00:00.000Z",
          },
          {
            id: "headline-general",
            offer_id: "sample-offer",
            tenant_id: "sample-tenant",
            scope_id: "sample-scope",
            type: "headline",
            content_json: { title: "Zusätzliche Leistungen" },
            order_index: 14,
            created_at: "2026-03-20T00:00:00.000Z",
            updated_at: "2026-03-20T00:00:00.000Z",
          },
          {
            id: "item-6",
            offer_id: "sample-offer",
            tenant_id: "sample-tenant",
            scope_id: "sample-scope",
            type: "line_item",
            content_json: {
              title: "Wartungspaket (monatlich)",
              amount: 1,
              unit: "fixed",
              cost_per_item: 150,
              tax: 20,
              item_total: 150,
              line_item_subtype: "position",
            },
            order_index: 15,
            created_at: "2026-03-20T00:00:00.000Z",
            updated_at: "2026-03-20T00:00:00.000Z",
          },
          {
            id: "item-7",
            offer_id: "sample-offer",
            tenant_id: "sample-tenant",
            scope_id: "sample-scope",
            type: "line_item",
            content_json: {
              title: "Hosting & Monitoring",
              amount: 1,
              unit: "fixed",
              cost_per_item: 80,
              tax: 20,
              item_total: 80,
              line_item_subtype: "position",
            },
            order_index: 16,
            created_at: "2026-03-20T00:00:00.000Z",
            updated_at: "2026-03-20T00:00:00.000Z",
          },
        ],
        companyProfile: {
          name: "engrd digital design GmbH",
          brand_name: "engrd",
          address_street: "Kirchengasse 48",
          address_zip: "1070",
          address_city: "Wien",
          address_country: "Österreich",
          email: "hello@engrd.at",
          website: "www.engrd.at",
          phone: "+43 1 234 5678",
          iban: "AT61 1904 3002 3457 3201",
          bic: "RZTIAT22263",
          bank_name: "Raiffeisenbank",
          bank_account_name: "engrd digital design GmbH",
          vat_id: "ATU12345678",
          company_registration_number: "FN 123456 x",
          tax_number: "12345678",
        },
        commercialSettings: { default_locale: "de-DE", no_tax_reason: null },
      }),
    resolvePreviewData: async ({ auth, recordId }) => {
      const supabase = server.getDatabaseAdapter?.();
      if (!supabase) {
        throw new Error("Database adapter unavailable");
      }
      const repo = createOfferRepoSupabase(
        supabase,
        auth.tenantId,
        auth.scopeId
      );
      const offer = await repo.getById(recordId);
      if (!offer) {
        throw new Error("Offer not found");
      }
      const blocks = await repo.listBlocks(recordId);
      const companyProfile = (await invokeOperation(
        "company_profile_get",
        {},
        { auth }
      )) as Record<string, unknown> | null;
      const commercialSettings = (await invokeOperation(
        "commercial_settings_get",
        {},
        { auth }
      )) as Record<string, unknown> | null;

      return buildOfferTemplatePayload({
        offer,
        blocks,
        companyProfile,
        commercialSettings,
      });
    },
  });
}
