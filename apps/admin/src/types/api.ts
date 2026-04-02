export type RequestStatus = 'pending' | 'approved' | 'denied';
export type MessageStatus = 'open' | 'closed';

export interface SkillNode {
  id: string;
  name: string;
  slug: string;
  path: string | null;
}

export interface Profile {
  username: string | null;
}

export interface RestructureRequest {
  id: string;
  requester_user_id: string | null;
  target_node_id: string | null;
  proposal: Record<string, unknown>;
  proposal_version: number;
  message: string | null;
  status: RequestStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  denial_reason: string | null;
  created_at: string;
  target_node?: SkillNode | null;
  requester?: Profile | null;
}

export interface SupportMessage {
  id: string;
  sender_user_id: string | null;
  email: string | null;
  subject: string;
  body: string;
  status: MessageStatus;
  handled_by: string | null;
  handled_at: string | null;
  created_at: string;
  sender?: Profile | null;
}

export interface AuditLogEntry {
  id: string;
  actor_user_id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  created_at: string;
  actor?: Profile | null;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number | null;
  page: number;
  limit: number;
}
