import type { RestructureProposal, ProposalChangeType } from '../types/restructure';

export function serializeProposal(
  type: ProposalChangeType,
  changes: RestructureProposal['changes']
): RestructureProposal {
  return { version: 1, type, changes };
}
