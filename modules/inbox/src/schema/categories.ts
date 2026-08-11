/**
 * Inbox message categories — tenant-configurable catalog.
 *
 * Fixed defaults ship with the module; tenants may add custom slugs, reorder,
 * hide from the menu, override labels, and edit classifier rules. Values are
 * stored on `messages.ai_category` as free text (no DB enum).
 */

export const INBOX_CATEGORIES_SETTING_KEY = "inbox.categories";

/** Built-in slugs — locked (cannot delete); title/rule/visible/order editable. */
export const FIXED_INBOX_CATEGORIES = [
  "conversation",
  "notification",
  "newsletter",
  "promotion",
  "spam",
] as const;

export type FixedInboxCategory = (typeof FIXED_INBOX_CATEGORIES)[number];

/** @deprecated Prefer FIXED_INBOX_CATEGORIES — kept as the fixed-defaults alias. */
export const INBOX_MESSAGE_CATEGORIES = FIXED_INBOX_CATEGORIES;

export interface InboxCategoryItem {
  order: number;
  /** Classifier / digest guide line for this slug. */
  rule?: string;
  slug: string;
  /** UI label override; fixed slugs fall back to i18n `categories.<slug>`. */
  title?: string;
  /** Show in sidebar + category tabs. */
  visible: boolean;
}

export interface InboxCategoriesConfig {
  items: InboxCategoryItem[];
}

const fixedSet = new Set<string>(FIXED_INBOX_CATEGORIES);

export const DEFAULT_CATEGORY_RULES: Readonly<
  Record<FixedInboxCategory, string>
> = {
  conversation:
    "correspondence with an actual counterpart about shared work — requests, questions, coordination, replies within an existing working relationship.",
  newsletter:
    "subscribed periodical content or product updates sent to a list.",
  notification:
    "automated system/service message about something that happened (alerts, receipts, invoices, calendar invites, security warnings).",
  promotion:
    "the sender's goal is to sell, book a demo, or acquire you as a customer — INCLUDING personally written cold outreach. A hand-written mail is not a conversation just because a human typed it.",
  spam: "unsolicited junk, phishing, or obvious scam.",
};

export const DEFAULT_CATEGORY_TIEBREAKER =
  "Judge by the sender's purpose, not the tone. When several fit, the most specific wins: spam > promotion > newsletter > notification > conversation.";

export function isFixedInboxCategory(slug: string): slug is FixedInboxCategory {
  return fixedSet.has(slug);
}

export function normalizeCategorySlug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[\s/]+/g, "-")
    .replace(/[^a-z0-9_-]/g, "")
    .replace(/-+/g, "-")
    .slice(0, 64);
}

export function defaultRuleForSlug(slug: string): string | undefined {
  if (isFixedInboxCategory(slug)) {
    return DEFAULT_CATEGORY_RULES[slug];
  }
  return;
}

export function defaultInboxCategories(): InboxCategoriesConfig {
  return {
    items: FIXED_INBOX_CATEGORIES.map((slug, order) => ({
      order,
      rule: DEFAULT_CATEGORY_RULES[slug],
      slug,
      visible: true,
    })),
  };
}

function parseItem(
  raw: unknown,
  fallbackOrder: number
): InboxCategoryItem | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const candidate = raw as {
    order?: unknown;
    rule?: unknown;
    slug?: unknown;
    title?: unknown;
    visible?: unknown;
  };
  const slug = normalizeCategorySlug(String(candidate.slug ?? ""));
  if (!slug) {
    return null;
  }
  const title =
    typeof candidate.title === "string" && candidate.title.trim()
      ? candidate.title.trim()
      : undefined;
  const rule =
    typeof candidate.rule === "string" && candidate.rule.trim()
      ? candidate.rule.trim()
      : undefined;
  return {
    order:
      typeof candidate.order === "number" && Number.isFinite(candidate.order)
        ? candidate.order
        : fallbackOrder,
    rule: rule ?? defaultRuleForSlug(slug),
    slug,
    title,
    visible: typeof candidate.visible === "boolean" ? candidate.visible : true,
  };
}

/**
 * Normalize a raw tenant-settings value into a complete catalog.
 * Always re-injects any missing fixed categories.
 */
export function mergeInboxCategories(raw: unknown): InboxCategoriesConfig {
  const items: InboxCategoryItem[] = [];
  const seen = new Set<string>();

  const list =
    raw &&
    typeof raw === "object" &&
    !Array.isArray(raw) &&
    Array.isArray((raw as { items?: unknown }).items)
      ? (raw as { items: unknown[] }).items
      : Array.isArray(raw)
        ? raw
        : null;

  if (list) {
    for (const entry of list) {
      const item = parseItem(entry, items.length);
      if (!(item && !seen.has(item.slug))) {
        continue;
      }
      seen.add(item.slug);
      items.push(item);
    }
  }

  for (const slug of FIXED_INBOX_CATEGORIES) {
    if (!seen.has(slug)) {
      items.push({
        order: items.length,
        rule: DEFAULT_CATEGORY_RULES[slug],
        slug,
        visible: true,
      });
      seen.add(slug);
    }
  }

  if (items.length === 0) {
    return defaultInboxCategories();
  }

  items.sort((a, b) => a.order - b.order);
  return {
    items: items.map((item, order) => ({ ...item, order })),
  };
}

/** Prompt block for classifier / digest from the configured catalog. */
export function buildCategoryGuide(
  items: readonly InboxCategoryItem[]
): string {
  const lines = items.map((item) => {
    const rule =
      item.rule?.trim() || defaultRuleForSlug(item.slug) || item.slug;
    return `- ${item.slug}: ${rule}`;
  });
  lines.push(DEFAULT_CATEGORY_TIEBREAKER);
  return lines.join("\n");
}

export function categorySlugs(
  items: readonly InboxCategoryItem[]
): readonly string[] {
  return items.map((item) => item.slug);
}

export function visibleInboxCategories(
  config: InboxCategoriesConfig
): InboxCategoryItem[] {
  return config.items
    .filter((item) => item.visible)
    .slice()
    .sort((a, b) => a.order - b.order);
}
