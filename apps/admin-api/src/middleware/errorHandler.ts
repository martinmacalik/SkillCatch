import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof ZodError) {
    res.status(422).json({ error: 'Validation error', details: err.errors });
    return;
  }
  console.error('[admin-api error]', err.message, err.stack);
  res.status(500).json({ error: 'Internal server error' });
}
