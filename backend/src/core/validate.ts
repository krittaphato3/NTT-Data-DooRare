import { HttpError } from '../middleware/httpError.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID.test(value);

export function uuidParam(value: unknown, name: string): string {
  if (!isUuid(value)) throw new HttpError(400, 'VALIDATION', `${name} ต้องเป็น UUID`);
  return value;
}

export function bodyObject(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'VALIDATION', 'ต้องส่ง JSON object');
  return body as Record<string, unknown>;
}

export function optionalNumber(value: unknown, name: string, { min, max }: { min?: number; max?: number } = {}): number | undefined {
  if (value === undefined || value === null) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || (min !== undefined && n < min) || (max !== undefined && n > max)) {
    throw new HttpError(400, 'VALIDATION', `${name} ไม่ถูกต้อง`);
  }
  return n;
}

export function optionalStringArray(value: unknown, name: string, maxItems: number): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > maxItems || value.some((v) => typeof v !== 'string' || v.length === 0 || v.length > 300)) {
    throw new HttpError(400, 'VALIDATION', `${name} ต้องเป็นรายการข้อความไม่เกิน ${maxItems} รายการ`);
  }
  return value as string[];
}
