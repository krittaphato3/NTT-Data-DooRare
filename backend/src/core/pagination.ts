/** Cursor pagination shared by list endpoints (spec §13.1: `?cursor=&limit=` default 50, max 200 → `{items, nextCursor}`). */
import { HttpError } from '../middleware/httpError.js';

export interface PageParams {
  limit: number;
  offset: number;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

const encodeCursor = (offset: number): string => Buffer.from(String(offset), 'utf8').toString('base64url');

export function parsePage(query: Record<string, unknown>): PageParams {
  let limit = DEFAULT_LIMIT;
  if (query.limit !== undefined) {
    limit = Number(query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
      throw new HttpError(400, 'INVALID_QUERY', `limit ต้องเป็นจำนวนเต็ม 1-${MAX_LIMIT}`);
    }
  }
  let offset = 0;
  if (query.cursor !== undefined) {
    if (typeof query.cursor !== 'string' || query.cursor.length === 0) {
      throw new HttpError(400, 'INVALID_QUERY', 'cursor ต้องเป็นสตริงที่ได้จาก nextCursor');
    }
    const decoded = Buffer.from(query.cursor, 'base64url').toString('utf8');
    if (!/^\d{1,9}$/.test(decoded) || encodeCursor(Number(decoded)) !== query.cursor) {
      throw new HttpError(400, 'INVALID_QUERY', 'cursor ไม่ถูกต้อง');
    }
    offset = Number(decoded);
  }
  return { limit, offset };
}

/** Pass `limit + 1` rows fetched; returns the page and the cursor of the next one (null on the last page). */
export function toPage<T>(rows: T[], page: PageParams): { items: T[]; nextCursor: string | null } {
  const hasMore = rows.length > page.limit;
  return { items: hasMore ? rows.slice(0, page.limit) : rows, nextCursor: hasMore ? encodeCursor(page.offset + page.limit) : null };
}

export const oneOf = <T extends string>(value: unknown, allowed: readonly T[], name: string): T | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    throw new HttpError(400, 'INVALID_QUERY', `${name} ต้องเป็นหนึ่งใน ${allowed.join(', ')}`);
  }
  return value as T;
};
