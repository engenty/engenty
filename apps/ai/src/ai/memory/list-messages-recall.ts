// Mastra `recall()` → `listMessages` contract: date range, shallow metadata,
// pagination, then union `include` windows (semantic hits + neighbors).

import type { MastraDBMessage } from "@mastra/core/memory";
import {
  calculatePagination,
  filterByDateRange,
  normalizePerPage,
  type StorageListMessagesInput,
  type StorageListMessagesOutput,
  type StorageMetadataFilter,
  storageMessageMatchesMetadataFilter,
  validateStorageMetadataFilter,
} from "@mastra/core/storage";

export const DEFAULT_RECALL_PER_PAGE = 40;

type RecallDateRange = NonNullable<
  NonNullable<StorageListMessagesInput["filter"]>["dateRange"]
>;

export interface SqlDateBounds {
  after?: Date;
  afterExclusive?: boolean;
  before?: Date;
  beforeExclusive?: boolean;
}

export function sqlDateBoundsFromFilter(
  dateRange: RecallDateRange | undefined
): SqlDateBounds {
  if (!dateRange) {
    return {};
  }
  const bounds: SqlDateBounds = {};
  if (dateRange.start) {
    bounds.after = dateRange.start;
    if (dateRange.startExclusive) {
      bounds.afterExclusive = true;
    }
  }
  if (dateRange.end) {
    bounds.before = dateRange.end;
    if (dateRange.endExclusive) {
      bounds.beforeExclusive = true;
    }
  }
  return bounds;
}

export function messagePassesResourceFilter(
  message: MastraDBMessage,
  resourceId: string | undefined,
  conversationResourceIds: readonly string[]
): boolean {
  if (!(resourceId && message.resourceId)) {
    return true;
  }
  if (conversationResourceIds.includes(resourceId)) {
    return true;
  }
  if (message.threadId && resourceId === message.threadId) {
    return true;
  }
  return message.resourceId === resourceId;
}

export function filterMessagesForRecall(
  messages: MastraDBMessage[],
  input: {
    conversationResourceIds: readonly string[];
    dateRange?: RecallDateRange;
    metadata?: StorageMetadataFilter;
    resourceId?: string;
  }
): MastraDBMessage[] {
  const metadataFilter = validateStorageMetadataFilter(input.metadata);
  return filterByDateRange(
    messages.filter((message) =>
      messagePassesResourceFilter(
        message,
        input.resourceId,
        input.conversationResourceIds
      )
    ),
    (message) => message.createdAt,
    input.dateRange
  ).filter((message) =>
    storageMessageMatchesMetadataFilter(message.content, metadataFilter)
  );
}

export function sortMastraMessages(
  messages: MastraDBMessage[],
  orderBy: StorageListMessagesInput["orderBy"]
): MastraDBMessage[] {
  const direction = orderBy?.direction ?? "ASC";
  return [...messages].sort((left, right) => {
    const delta = left.createdAt.getTime() - right.createdAt.getTime();
    if (delta !== 0) {
      return direction === "DESC" ? -delta : delta;
    }
    return left.id.localeCompare(right.id);
  });
}

export function paginateRecallMessages(input: {
  include?: StorageListMessagesInput["include"];
  messages: MastraDBMessage[];
  orderBy: StorageListMessagesInput["orderBy"];
  page?: number;
  perPage?: number | false;
}): {
  hasMore: boolean;
  offset: number;
  page: number;
  paginated: MastraDBMessage[];
  perPage: number | false;
  total: number;
} {
  const page = input.page ?? 0;
  if (page < 0) {
    throw new Error("page must be >= 0");
  }
  const normalized = normalizePerPage(input.perPage, DEFAULT_RECALL_PER_PAGE);
  const { offset, perPage } = calculatePagination(
    page,
    input.perPage,
    normalized
  );
  const sorted = sortMastraMessages(input.messages, input.orderBy);
  const total = sorted.length;
  if (normalized === 0 && !(input.include && input.include.length > 0)) {
    return {
      hasMore: false,
      offset,
      page,
      paginated: [],
      perPage,
      total: 0,
    };
  }
  const paginated =
    input.perPage === false || normalized === 0
      ? normalized === 0
        ? []
        : sorted
      : sorted.slice(offset, offset + normalized);
  const hasMore =
    perPage !== false && normalized !== 0 && offset + paginated.length < total;
  return { hasMore, offset, page, paginated, perPage, total };
}

export function expandIncludeWindows(input: {
  conversationResourceIds: readonly string[];
  include: NonNullable<StorageListMessagesInput["include"]>;
  messagesById: Map<string, MastraDBMessage>;
  orderedByThread: Map<string, MastraDBMessage[]>;
  resourceId?: string;
}): MastraDBMessage[] {
  const resolved: MastraDBMessage[] = [];
  const resolvedIds = new Set<string>();
  for (const item of input.include) {
    const target = input.messagesById.get(item.id);
    if (!target) {
      continue;
    }
    if (item.threadId && target.threadId !== item.threadId) {
      continue;
    }
    if (
      !messagePassesResourceFilter(
        target,
        input.resourceId,
        input.conversationResourceIds
      )
    ) {
      continue;
    }
    const threadId = target.threadId;
    if (!threadId) {
      continue;
    }
    const contextWindow = input.orderedByThread.get(threadId) ?? [];
    const targetIndex = contextWindow.findIndex(
      (message) => message.id === item.id
    );
    if (targetIndex === -1) {
      continue;
    }
    const previous = item.withPreviousMessages ?? 0;
    const startIndex = Math.max(0, targetIndex - previous);
    const endIndex = targetIndex + (item.withNextMessages ?? 0) + 1;
    for (const message of contextWindow.slice(startIndex, endIndex)) {
      if (resolvedIds.has(message.id)) {
        continue;
      }
      if (
        !messagePassesResourceFilter(
          message,
          input.resourceId,
          input.conversationResourceIds
        )
      ) {
        continue;
      }
      resolved.push(message);
      resolvedIds.add(message.id);
    }
  }
  return resolved;
}

export function unionRecallPageWithIncludes(input: {
  included: MastraDBMessage[];
  orderBy: StorageListMessagesInput["orderBy"];
  paginated: MastraDBMessage[];
}): MastraDBMessage[] {
  const ids = new Set(input.paginated.map((message) => message.id));
  const merged = [...input.paginated];
  for (const message of input.included) {
    if (ids.has(message.id)) {
      continue;
    }
    merged.push(message);
    ids.add(message.id);
  }
  return sortMastraMessages(merged, input.orderBy);
}

export function recallListOutput(input: {
  hasMore: boolean;
  messages: MastraDBMessage[];
  page: number;
  perPage: number | false;
  total: number;
}): StorageListMessagesOutput {
  return {
    hasMore: input.hasMore,
    messages: input.messages,
    page: input.page,
    perPage: input.perPage,
    total: input.total,
  };
}
