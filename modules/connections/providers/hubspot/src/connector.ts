import {
  type ConnectorAction,
  type ConnectorActionContext,
  type ConnectorActionGroup,
  defineConnector,
} from "@engenty/connections-sdk";
import { z } from "zod";

const HUBSPOT_API = "https://api.hubapi.com";

interface HubSpotCredentials {
  access_token: string;
}

interface HubSpotContactProperties {
  company?: string;
  email?: string;
  firstname?: string;
  jobtitle?: string;
  lastname?: string;
  phone?: string;
}

interface HubSpotContact {
  id: string;
  properties?: HubSpotContactProperties;
}

interface HubSpotListResponse {
  paging?: { next?: { after?: string } };
  results?: HubSpotContact[];
}

function parseCredentials(accessToken: string): HubSpotCredentials {
  let parsed: Partial<HubSpotCredentials>;
  try {
    parsed = JSON.parse(accessToken) as Partial<HubSpotCredentials>;
  } catch {
    throw new Error(
      "hubspot_credentials_invalid: stored credentials are not JSON"
    );
  }
  if (!parsed.access_token?.trim()) {
    throw new Error("hubspot_credentials_invalid: missing access_token");
  }
  return { access_token: parsed.access_token.trim() };
}

async function errorExcerpt(res: Response): Promise<string> {
  const body = await res.text().catch(() => "");
  return body.replace(/\s+/g, " ").trim().slice(0, 200) || res.statusText;
}

async function hubspotJson<T>(
  ctx: ConnectorActionContext,
  path: string,
  init?: RequestInit
): Promise<T> {
  const creds = parseCredentials(ctx.accessToken);
  const res = await ctx.fetchImpl(`${HUBSPOT_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${creds.access_token}`,
      "content-type": "application/json",
      ...((init?.headers as Record<string, string> | undefined) ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(
      `hubspot_api_error (${res.status}): ${await errorExcerpt(res)}`
    );
  }
  return (await res.json()) as T;
}

function mapContact(contact: HubSpotContact) {
  const p = contact.properties ?? {};
  const displayName =
    [p.firstname, p.lastname].filter(Boolean).join(" ").trim() ||
    p.email ||
    null;
  return {
    company: p.company ?? null,
    display_name: displayName,
    email: p.email ?? null,
    first_name: p.firstname ?? null,
    hubspot_id: contact.id,
    last_name: p.lastname ?? null,
    phone: p.phone ?? null,
    title: p.jobtitle ?? null,
  };
}

function connectorAction<S extends z.ZodType>(def: {
  description: string;
  group: ConnectorActionGroup;
  handler: (
    input: z.output<S>,
    ctx: ConnectorActionContext
  ) => Promise<unknown>;
  id: string;
  inputSchema: S;
  summary: string;
}): ConnectorAction {
  return {
    description: def.description,
    group: def.group,
    handler: (input, ctx) =>
      def.handler(def.inputSchema.parse(input) as z.output<S>, ctx),
    id: def.id,
    inputSchema: def.inputSchema,
    providerScopes: [],
    summary: def.summary,
  };
}

export async function verifyHubSpotCredentials(
  raw: Record<string, string>,
  fetchImpl: typeof fetch
): Promise<{ externalId?: string; label: string }> {
  const token = raw.access_token?.trim();
  if (!token) {
    throw new Error("missing access_token");
  }
  const res = await fetchImpl(
    `${HUBSPOT_API}/crm/v3/objects/contacts?limit=1`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  if (!res.ok) {
    throw new Error(
      `hubspot_verify_failed (${res.status}): ${await errorExcerpt(res)}`
    );
  }
  // Account details require a separate scopes-heavy call; use a stable label.
  return { label: "HubSpot" };
}

export const hubspotConnector = defineConnector({
  actions: [
    connectorAction({
      description:
        "List HubSpot CRM contacts. Returns compact rows for import: display name, first/last name, email, phone, company, title, hubspot_id.",
      group: "read",
      handler: async (input, ctx) => {
        const params = new URLSearchParams({
          limit: String(input.page_size ?? 100),
          properties: [
            "email",
            "firstname",
            "lastname",
            "phone",
            "company",
            "jobtitle",
          ].join(","),
        });
        if (input.page_token) {
          params.set("after", input.page_token);
        }
        const data = await hubspotJson<HubSpotListResponse>(
          ctx,
          `/crm/v3/objects/contacts?${params.toString()}`
        );
        return {
          contacts: (data.results ?? []).map(mapContact),
          next_page_token: data.paging?.next?.after ?? null,
        };
      },
      id: "list_contacts",
      inputSchema: z.object({
        page_size: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe("Page size (1–100). Defaults to 100."),
        page_token: z
          .string()
          .optional()
          .describe("Pagination cursor from a previous list_contacts call."),
      }),
      summary: "List HubSpot contacts",
    }),
  ],
  auth: {
    kind: "api_key",
    apiKey: {
      fields: [
        {
          key: "access_token",
          label: "Private app access token",
          placeholder: "pat-…",
          secret: true,
        },
      ],
      verify: verifyHubSpotCredentials,
    },
  },
  description:
    "Import contacts from HubSpot CRM using a private app access token.",
  icon: "🔌",
  id: "hubspot",
  moduleId: "connections-hubspot",
  name: "HubSpot",
  toolPrefix: "hubspot",
});
