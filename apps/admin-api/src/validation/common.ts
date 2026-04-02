import { z } from 'zod';

export const uuidSchema = z.string().uuid('Invalid UUID format');

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const requestStatusSchema = z
  .enum(['pending', 'approved', 'denied'])
  .optional();

export const messageStatusSchema = z.enum(['open', 'closed']).optional();
