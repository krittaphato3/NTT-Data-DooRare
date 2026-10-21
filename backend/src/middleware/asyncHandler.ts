import type { NextFunction, Request, RequestHandler, Response } from 'express';

/** Forwards a rejected promise to `errorHandler`, so route handlers can be plain async functions. */
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}
