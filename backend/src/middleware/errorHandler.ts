import type { Request, Response, NextFunction } from 'express';

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
  details?: any;
}

export function errorHandler(
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const statusCode = err.statusCode || 500;
  const problem = {
    type: `https://doorare.example/errors/${err.code || 'INTERNAL_ERROR'}`,
    title: err.message || 'เกิดข้อผิดพลาดภายในระบบ',
    status: statusCode,
    code: err.code || 'INTERNAL_ERROR',
    details: err.details,
  };

  if (statusCode >= 500) {
    console.error('[Internal Error]', err);
  }

  res.status(statusCode).json(problem);
}
