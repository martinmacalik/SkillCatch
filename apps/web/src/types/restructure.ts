export type FeedbackType = 'restructure' | 'new-node' | 'report' | 'missing';

export type ProposalChangeType =
  | 'rename'
  | 'reparent'
  | 'add_child'
  | 'move'
  | 'merge'
  | 'split';

export interface RestructureProposal {
  version: 1;
  type: ProposalChangeType;
  changes: {
    new_parent_ids?: string[];
    new_name?: string;
    child_node?: {
      name: string;
      slug: string;
      is_leaf: boolean;
    };
    merge_node_ids?: string[];
    notes?: string;
  };
}
