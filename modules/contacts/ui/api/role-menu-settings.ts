import { apiRequest } from "./request.js";

export const FIXED_CONTACT_ROLES = [
  "client",
  "partner",
  "supplier",
  "team",
] as const;

export type FixedContactsRole = (typeof FIXED_CONTACT_ROLES)[number];
export type ContactsRole = string;

export interface ContactsRoleMenuItem {
  order: number;
  plural?: string;
  slug: string;
  title?: string;
  visible: boolean;
}

export interface ContactsRoleMenuConfig {
  items: ContactsRoleMenuItem[];
}

const TENANT_SETTING_KEY = "contacts.roles.menu";

const fixedRoleSet = new Set<FixedContactsRole>(FIXED_CONTACT_ROLES);
const fixedRolePluralKeys: Record<FixedContactsRole, string> = {
  client: "menu.clients",
  partner: "menu.partners",
  supplier: "menu.suppliers",
  team: "menu.team",
};

export function isFixedRole(role: string): role is FixedContactsRole {
  return fixedRoleSet.has(role as FixedContactsRole);
}

export function getRoleTitleLabel(
  slug: string,
  t: (key: string) => string
): string {
  if (isFixedRole(slug)) {
    return t(`role.${slug}`);
  }
  return slug;
}

export function getRolePluralLabel(
  slug: string,
  t: (key: string) => string
): string {
  if (isFixedRole(slug)) {
    return t(fixedRolePluralKeys[slug]);
  }
  return slug;
}

export function normalizeRoleSlug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[\s/]+/g, "-")
    .replace(/[^a-z0-9_-]/g, "")
    .replace(/-+/g, "-");
}

export function defaultRoleMenu(): ContactsRoleMenuConfig {
  return {
    items: [
      { slug: "client", visible: true, order: 0 },
      { slug: "partner", visible: true, order: 1 },
      { slug: "supplier", visible: true, order: 2 },
      { slug: "team", visible: true, order: 3 },
    ],
  };
}

export async function getContactsRoleMenuConfig(
  signal?: AbortSignal
): Promise<ContactsRoleMenuConfig> {
  const res = await apiRequest<{
    name: string;
    type: string;
    value: unknown;
  }>(`/api/tenant-settings/${encodeURIComponent(TENANT_SETTING_KEY)}`, {
    method: "GET",
    signal,
  }).catch(() => null);

  if (res?.type === "json" && res.value && typeof res.value === "object") {
    const raw = res.value as { items?: unknown[] };
    if (Array.isArray(raw.items)) {
      const items: ContactsRoleMenuItem[] = [];
      const seen = new Set<string>();
      for (const item of raw.items) {
        const candidate = item as {
          slug?: unknown;
          plural?: unknown;
          role?: unknown;
          label?: unknown;
          title?: unknown;
          visible?: unknown;
          order?: unknown;
        };
        const slug = normalizeRoleSlug(
          String(candidate.slug ?? candidate.role ?? "")
        );
        if (
          item &&
          typeof item === "object" &&
          slug.length > 0 &&
          slug.length <= 64 &&
          !seen.has(slug)
        ) {
          seen.add(slug);
          items.push({
            slug,
            title:
              typeof candidate.title === "string" && candidate.title.trim()
                ? candidate.title.trim()
                : typeof candidate.label === "string" && candidate.label.trim()
                  ? candidate.label.trim()
                  : undefined,
            plural:
              typeof candidate.plural === "string" && candidate.plural.trim()
                ? candidate.plural.trim()
                : undefined,
            visible:
              typeof candidate.visible === "boolean" ? candidate.visible : true,
            order:
              typeof candidate.order === "number"
                ? candidate.order
                : items.length,
          });
        }
      }
      for (const role of FIXED_CONTACT_ROLES) {
        if (!seen.has(role)) {
          items.push({ slug: role, visible: true, order: items.length });
        }
      }
      items.sort((a, b) => a.order - b.order);
      return { items };
    }
  }

  return defaultRoleMenu();
}

export async function setContactsRoleMenuConfig(
  config: ContactsRoleMenuConfig
): Promise<void> {
  const normalized: ContactsRoleMenuItem[] = [];
  for (const [index, item] of config.items.entries()) {
    const slug = normalizeRoleSlug(item.slug);
    if (!slug) {
      continue;
    }
    const title =
      typeof item.title === "string" && item.title.trim().length > 0
        ? item.title.trim()
        : undefined;
    const plural =
      typeof item.plural === "string" && item.plural.trim().length > 0
        ? item.plural.trim()
        : undefined;
    normalized.push({
      slug,
      title,
      plural,
      visible: Boolean(item.visible),
      order: index,
    });
  }
  const seen = new Set<string>();
  const deduped: ContactsRoleMenuItem[] = normalized.filter((item) => {
    if (seen.has(item.slug)) {
      return false;
    }
    seen.add(item.slug);
    return true;
  });
  for (const role of FIXED_CONTACT_ROLES) {
    if (!seen.has(role)) {
      deduped.push({
        slug: role,
        visible: true,
        order: deduped.length,
      });
    }
  }
  await apiRequest(
    `/api/tenant-settings/${encodeURIComponent(TENANT_SETTING_KEY)}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        type: "json",
        value_jsonb: { items: deduped },
      }),
    }
  );
}
