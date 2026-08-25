import { ObjectLiteral, SelectQueryBuilder } from "typeorm";

/**
 * Generic keyset (cursor) pagination helper for any TypeORM `SelectQueryBuilder`.
 *
 * Unlike `pagination.ts`'s `queryInvoicesPage` (which is hard-coded to the
 * Invoice entity and a fixed `createdAt` + `id` sort), this helper works over
 * any entity and any single sortable column, so it can back any list endpoint
 * that needs stable, O(1)-per-page cursor pagination instead of offset/limit.
 *
 * The cursor is opaque to callers: it is a base64 encoding of
 * `{ field, value }` for the last row of the current page, so API consumers
 * can round-trip it without needing to understand its internal shape.
 */

export interface PaginateQueryOptions<T extends ObjectLiteral> {
  /** Query builder pre-configured with `select`/`where`/joins, but WITHOUT
   *  ordering, cursor filtering, or a `take` limit applied yet. */
  queryBuilder: SelectQueryBuilder<T>;
  /** Column to sort and page by (must be unique or combined with a tiebreaker
   *  that is already unique, e.g. a primary key). Dot-qualified with the
   *  query builder's alias, e.g. "invoice.createdAt". */
  cursorField: string;
  /** Sort direction for `cursorField`. Defaults to "DESC". */
  order?: "ASC" | "DESC";
  /** Maximum number of items to return for this page. */
  limit: number;
  /** Opaque cursor from a previous page's `nextCursor`, or omitted/null for
   *  the first page. */
  cursor?: string | null;
}

export interface PaginateQueryResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

interface DecodedCursor {
  field: string;
  value: string | number;
}

/**
 * Encodes a cursor field/value pair as an opaque base64 string.
 */
export function encodeQueryCursor(field: string, value: string | number | Date): string {
  const normalizedValue = value instanceof Date ? value.toISOString() : value;
  return Buffer.from(JSON.stringify({ field, value: normalizedValue })).toString("base64");
}

/**
 * Decodes an opaque cursor previously produced by `encodeQueryCursor` /
 * `paginateQuery`.
 *
 * @throws Error if the cursor is not valid base64-encoded JSON, or is
 *   missing the expected `field`/`value` shape.
 */
export function decodeQueryCursor(cursor: string): DecodedCursor {
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(cursor, "base64").toString("utf-8"));
  } catch {
    throw new Error("Invalid cursor: not valid base64-encoded JSON");
  }

  if (
    typeof decoded !== "object" ||
    decoded === null ||
    !("field" in decoded) ||
    !("value" in decoded)
  ) {
    throw new Error("Invalid cursor: missing 'field' or 'value'");
  }

  const { field, value } = decoded as { field: unknown; value: unknown };

  if (typeof field !== "string" || (typeof value !== "string" && typeof value !== "number")) {
    throw new Error("Invalid cursor: 'field' must be a string and 'value' a string or number");
  }

  return { field, value };
}

/**
 * Extracts the alias-qualified column's bare column name and TypeORM
 * parameter-safe alias for use in query fragments, e.g.
 * "invoice.createdAt" -> { alias: "invoice", column: "createdAt" }.
 */
function splitCursorField(cursorField: string): { alias: string; column: string } {
  const parts = cursorField.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(
      `Invalid cursorField "${cursorField}": expected "<alias>.<column>" (e.g. "invoice.createdAt")`,
    );
  }
  return { alias: parts[0], column: parts[1] };
}

/**
 * Generic cursor-based (keyset) pagination over any Prisma-style query
 * builder pattern — implemented here against TypeORM's `SelectQueryBuilder`,
 * following the standard cursor pattern: filter strictly past the last seen
 * value, order by the same field, and fetch one extra row to detect whether
 * more pages remain.
 *
 * The caller supplies a query builder with its own filters/joins already
 * applied; this helper only adds cursor filtering, ordering, and the
 * over-fetch used to compute `hasMore`.
 */
export async function paginateQuery<T extends ObjectLiteral>(
  options: PaginateQueryOptions<T>,
): Promise<PaginateQueryResult<T>> {
  const { queryBuilder, cursorField, limit, cursor } = options;
  const order = options.order ?? "DESC";

  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error("paginateQuery: 'limit' must be a positive integer");
  }

  const { alias, column } = splitCursorField(cursorField);
  const paramName = `cursor_${alias}_${column}`;

  if (cursor) {
    const decoded = decodeQueryCursor(cursor);
    if (decoded.field !== cursorField) {
      throw new Error(
        `Invalid cursor: was encoded for field "${decoded.field}" but query is paginating on "${cursorField}"`,
      );
    }

    const comparator = order === "DESC" ? "<" : ">";
    queryBuilder.andWhere(`${cursorField} ${comparator} :${paramName}`, {
      [paramName]: decoded.value,
    });
  }

  queryBuilder.orderBy(cursorField, order);
  // Fetch one extra row so we can tell whether another page follows without
  // a second COUNT query.
  queryBuilder.take(limit + 1);

  const rows = await queryBuilder.getMany();
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;

  let nextCursor: string | null = null;
  if (hasMore && items.length > 0) {
    const lastItem = items[items.length - 1] as unknown as Record<string, unknown>;
    const lastValue = lastItem[column];
    if (typeof lastValue === "string" || typeof lastValue === "number" || lastValue instanceof Date) {
      nextCursor = encodeQueryCursor(cursorField, lastValue);
    } else {
      throw new Error(
        `paginateQuery: cursor column "${column}" must resolve to a string, number, or Date (got ${typeof lastValue})`,
      );
    }
  }

  return { items, nextCursor, hasMore };
}
