import { z } from 'zod';

export const denyRequestSchema = z.object({
  denial_reason: z
    .string()
    .min(1, 'Denial reason is required')
    .max(1000, 'Denial reason must be under 1000 characters'),
});
