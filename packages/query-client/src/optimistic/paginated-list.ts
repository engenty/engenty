export interface OptimisticPage<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
}

export function createOptimisticId(): string {
  return `opt_${crypto.randomUUID()}`;
}

export function prependOptimisticItem<T>(
  page: OptimisticPage<T> | undefined,
  item: T
): OptimisticPage<T> | undefined {
  if (page?.page !== 1) {
    return page;
  }
  return {
    ...page,
    data: [item, ...page.data].slice(0, page.pageSize),
    total: page.total + 1,
  };
}

export function reconcileOptimisticItem<T extends { id: string }>(
  page: OptimisticPage<T> | undefined,
  optimisticId: string,
  saved: T
): OptimisticPage<T> | undefined {
  if (!page) {
    return page;
  }
  const optimisticIndex = page.data.findIndex(
    (item) => item.id === optimisticId
  );
  const savedIndex = page.data.findIndex((item) => item.id === saved.id);
  if (optimisticIndex < 0) {
    if (savedIndex >= 0 || page.page !== 1) {
      return page;
    }
    return {
      ...page,
      data: [saved, ...page.data].slice(0, page.pageSize),
      total: page.total + 1,
    };
  }

  const data = page.data.filter(
    (item) => item.id !== optimisticId && item.id !== saved.id
  );
  data.splice(Math.min(optimisticIndex, data.length), 0, saved);
  return {
    ...page,
    data: data.slice(0, page.pageSize),
  };
}

export function removeOptimisticItems<T extends { id: string }>(
  page: OptimisticPage<T> | undefined,
  ids: ReadonlySet<string>,
  adjustTotal = true
): OptimisticPage<T> | undefined {
  if (!page) {
    return page;
  }
  const data = page.data.filter((item) => !ids.has(item.id));
  const removed = page.data.length - data.length;
  if (removed === 0) {
    return page;
  }
  return {
    ...page,
    data,
    total: adjustTotal ? Math.max(0, page.total - removed) : page.total,
  };
}

export function patchOptimisticItems<T extends { id: string }>(
  page: OptimisticPage<T> | undefined,
  ids: ReadonlySet<string>,
  patch: Partial<T>,
  matches: (item: T) => boolean = () => true
): OptimisticPage<T> | undefined {
  if (!page) {
    return page;
  }
  let removed = 0;
  const data = page.data.flatMap((item) => {
    if (!ids.has(item.id)) {
      return [item];
    }
    const next = { ...item, ...patch };
    if (!matches(next)) {
      removed += 1;
      return [];
    }
    return [next];
  });
  return removed > 0
    ? { ...page, data, total: Math.max(0, page.total - removed) }
    : { ...page, data };
}

export function reorderOptimisticItems<T extends { id: string }>(
  items: readonly T[],
  orderedIds: readonly string[]
): T[] {
  const rank = new Map(orderedIds.map((id, index) => [id, index]));
  return [...items].sort((left, right) => {
    const leftRank = rank.get(left.id);
    const rightRank = rank.get(right.id);
    if (leftRank === undefined) {
      return rightRank === undefined ? 0 : 1;
    }
    if (rightRank === undefined) {
      return -1;
    }
    return leftRank - rightRank;
  });
}
