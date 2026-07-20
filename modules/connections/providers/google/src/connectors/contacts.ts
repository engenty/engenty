import {
  type ConnectorDefinition,
  defineConnector,
} from "@engenty/connections-sdk";
import { z } from "zod";
import { connectorAction, GOOGLE_OAUTH2, googleJson } from "../shared.js";

const PEOPLE_API = "https://people.googleapis.com/v1";
const SCOPE_READONLY = "https://www.googleapis.com/auth/contacts.readonly";

interface PeopleName {
  displayName?: string;
  familyName?: string;
  givenName?: string;
}

interface PeopleEmail {
  value?: string;
}

interface PeoplePhone {
  value?: string;
}

interface PeopleOrg {
  name?: string;
  title?: string;
}

interface Person {
  emailAddresses?: PeopleEmail[];
  names?: PeopleName[];
  organizations?: PeopleOrg[];
  phoneNumbers?: PeoplePhone[];
  resourceName?: string;
}

interface ConnectionsListResponse {
  connections?: Person[];
  nextPageToken?: string;
  totalPeople?: number;
}

function mapPerson(person: Person) {
  const name = person.names?.[0];
  const org = person.organizations?.[0];
  return {
    display_name: name?.displayName ?? null,
    email: person.emailAddresses?.[0]?.value ?? null,
    family_name: name?.familyName ?? null,
    given_name: name?.givenName ?? null,
    organization: org?.name ?? null,
    phone: person.phoneNumbers?.[0]?.value ?? null,
    resource_name: person.resourceName ?? null,
    title: org?.title ?? null,
  };
}

export const contactsConnector: ConnectorDefinition = defineConnector({
  actions: [
    connectorAction({
      description:
        "List contacts from Google Contacts (People API). Returns compact rows suitable for import: display name, given/family name, email, phone, organization, title.",
      group: "read",
      handler: async (input, ctx) => {
        const url = new URL(`${PEOPLE_API}/people/me/connections`);
        url.searchParams.set(
          "personFields",
          "names,emailAddresses,phoneNumbers,organizations"
        );
        url.searchParams.set("pageSize", String(input.page_size ?? 100));
        if (input.page_token) {
          url.searchParams.set("pageToken", input.page_token);
        }
        const data = await googleJson<ConnectionsListResponse>(
          ctx,
          url.toString()
        );
        return {
          contacts: (data.connections ?? []).map(mapPerson),
          next_page_token: data.nextPageToken ?? null,
          total_people: data.totalPeople ?? null,
        };
      },
      id: "list_contacts",
      inputSchema: z.object({
        page_size: z
          .number()
          .int()
          .min(1)
          .max(1000)
          .optional()
          .describe("Page size (1–1000). Defaults to 100."),
        page_token: z
          .string()
          .optional()
          .describe("Pagination token from a previous list_contacts call."),
      }),
      providerScopes: [SCOPE_READONLY],
      summary: "List Google Contacts",
    }),
    connectorAction({
      description:
        "Search Google Contacts by a query string (name, email, phone). Returns the same compact contact rows as list_contacts.",
      group: "read",
      handler: async (input, ctx) => {
        const url = new URL(`${PEOPLE_API}/people:searchContacts`);
        url.searchParams.set("query", input.query);
        url.searchParams.set(
          "readMask",
          "names,emailAddresses,phoneNumbers,organizations"
        );
        url.searchParams.set("pageSize", String(input.page_size ?? 30));
        const data = await googleJson<{
          results?: { person?: Person }[];
        }>(ctx, url.toString());
        return {
          contacts: (data.results ?? [])
            .map((r) => r.person)
            .filter((p): p is Person => Boolean(p))
            .map(mapPerson),
        };
      },
      id: "search_contacts",
      inputSchema: z.object({
        page_size: z
          .number()
          .int()
          .min(1)
          .max(30)
          .optional()
          .describe("Max results (1–30). Defaults to 30."),
        query: z.string().min(1).describe("Search query."),
      }),
      providerScopes: [SCOPE_READONLY],
      summary: "Search Google Contacts",
    }),
  ],
  auth: { kind: "oauth2", oauth2: GOOGLE_OAUTH2 },
  description:
    "Import and search people from Google Contacts via the People API.",
  icon: "logo:gmail",
  id: "google-contacts",
  moduleId: "connections-google",
  name: "Google Contacts",
  toolPrefix: "gcontacts",
});
