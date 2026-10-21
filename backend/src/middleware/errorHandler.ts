import type { Request, Response, NextFunction } from 'express';

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
  details?: any;
}

/** PostgreSQL error classes that mean "the request conflicts with the data", not "the server broke". */
const PG_ERRORS: Record<string, { status: number; code: string; message: string }> = {
  '23505': { status: 409, code: 'CONFLICT', message: 'ข้อมูลซ้ำกับที่มีอยู่แล้ว' },
  '23503': { status: 409, code: 'REFERENCE_CONFLICT', message: 'ข้อมูลที่อ้างอิงไม่มีอยู่หรือถูกใช้งานอยู่' },
  '23514': { status: 422, code: 'CONSTRAINT_VIOLATION', message: 'ข้อมูลไม่ผ่านเงื่อนไขของระบบ' },
  '22P02': { status: 400, code: 'VALIDATION', message: 'รูปแบบข้อมูลไม่ถูกต้อง' },
};

export function errorHandler(
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const pgError = err.statusCode === undefined && err.code ? PG_ERRORS[err.code] : undefined;
  const statusCode = pgError?.status ?? err.statusCode ?? 500;
  const code = pgError?.code ?? err.code ?? 'INTERNAL_ERROR';
  const problem = {
    type: `https://doorare.example/errors/${code}`,
    title: pgError?.message ?? (err.message || 'เกิดข้อผิดพลาดภายในระบบ'),
    status: statusCode,
    code,
    details: pgError ? { constraint: (err as { constraint?: string }).constraint } : err.details,
  };

  if (statusCode >= 500) {
    console.error('[Internal Error]', err);
  }

  res.status(statusCode).json(problem);
}
