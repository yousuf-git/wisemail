import type { Page, PageOptions } from "./types";

/**
 * Resend paginates every list endpoint the same way: `limit` plus an `after` cursor that is the
 * id of the last item, and `has_more` on the response. This is our normalised page: `nextCursor`
 * is set only when there is definitely another page to ask for.
 */
export function toPage<T, U extends { id: string }>(
  list: { data: U[]; has_more?: boolean },
  map: (item: U) => T,
): Page<T> {
  const last = list.data.at(-1);
  const hasMore = !!list.has_more && !!last;
  return { data: list.data.map(map), hasMore, nextCursor: hasMore ? last.id : undefined };
}

/** A list endpoint that has no pagination (Resend's topics list): one complete page. */
export function singlePage<T>(data: T[]): Page<T> {
  return { data, hasMore: false, nextCursor: undefined };
}

export type ListFn<T> = (options: PageOptions) => Promise<Page<T>>;

/**
 * Walks a paginated list to the end, yielding one page of items at a time. Stops on `hasMore:
 * false`, a missing cursor, or a repeated cursor (a misbehaving endpoint must not loop forever).
 * Errors from `list` propagate; a consumer that wants to resume later should checkpoint
 * `nextCursor` itself and use `list` directly.
 */
export async function* iteratePages<T>(
  list: ListFn<T>,
  options: { limit?: number; after?: string } = {},
): AsyncGenerator<T[], void, void> {
  const seen = new Set<string>();
  let after = options.after;
  for (;;) {
    const page = await list({ limit: options.limit, ...(after ? { after } : {}) });
    yield page.data;
    if (!page.hasMore || !page.nextCursor || seen.has(page.nextCursor)) return;
    seen.add(page.nextCursor);
    after = page.nextCursor;
  }
}

/** Every item of a paginated list. For small lists only (domains, segments); big ones stream. */
export async function collectAll<T>(
  list: ListFn<T>,
  options: { limit?: number; maxPages?: number } = {},
): Promise<T[]> {
  const items: T[] = [];
  let pages = 0;
  for await (const page of iteratePages(list, { limit: options.limit })) {
    items.push(...page);
    if (++pages >= (options.maxPages ?? 1000)) break;
  }
  return items;
}
