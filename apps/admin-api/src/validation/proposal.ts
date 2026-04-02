import { z } from 'zod';

export const proposalV1Schema = z.object({
  version: z.literal(1),
  type: z.enum(['rename', 'reparent', 'add_child', 'move', 'merge', 'split']),
  target_node_id: z.string().uuid().optional(),
  changes: z.object({
    new_parent_ids: z.array(z.string().uuid()).optional(),
    new_name: z.string().min(1).max(255).optional(),
    child_node: z
      .object({
        name: z.string().min(1).max(255),
        slug: z.string().min(1).max(255),
        is_leaf: z.boolean(),
      })
      .optional(),
    merge_node_ids: z.array(z.string().uuid()).optional(),
    notes: z.string().optional(),
  }),
});

export type ProposalV1 = z.infer<typeof proposalV1Schema>;

export function validateProposal(proposal: unknown): ProposalV1 {
  return proposalV1Schema.parse(proposal);
}
