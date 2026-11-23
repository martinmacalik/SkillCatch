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

export interface LearningSuggestion {
  id: string;
  skill_node_id: string;
  submitted_by: string;
  proposed_blocks: Array<{ id?: string; type: string; content: Record<string, unknown>; sort_order: number }>;
  message: string | null;
  status: 'pending' | 'approved' | 'denied';
  deny_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  skill_name: string | null;
  submitter_username: string | null;
}

export type SkillReviewStatus = 'pending' | 'approved' | 'rejected';

export interface SimilarSkill {
  id: string;
  name: string;
  is_leaf: boolean;
  parent_name: string | null;
}

export interface UserCreatedSkill {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  status: SkillReviewStatus;
  created_by: string | null;
  show_creator: boolean;
  created_at: string;
  reviewed_at: string | null;
  rejection_reason: string | null;
  duplicate_of: string | null;
  parent_name: string | null;
  parent_is_new: boolean; // a category the user suggested with this skill, decided together with it
  parent_parent_name: string | null;
  duplicate_of_name: string | null;
  creator_username: string | null;
  similar: SimilarSkill[];
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number | null;
  page: number;
  limit: number;
}

/* ── teaching licenses (admin-api /licenses) ── */

export type LicenseReviewStatus = 'pending' | 'approved' | 'rejected';
export type LicenseKind = 'new' | 'edit';

/** Same shape as LicensePayload in apps/web/src/types/teaching.ts */
export interface LicensePayload {
  titleBefore: string;
  titleAfter: string;
  role: string | null;
  countryCode: string;
  institutionType: string | null;
  institutionId: string | null;
  institutionName: string;
  institutionDomains: string[] | null;
  bio: string;
  photoPath: string | null;
  theme: string;
  skills: {
    skillNodeId: string;
    skillName: string;
    level: string;
    evidence: {
      kind: 'image' | 'video' | 'pdf' | 'link';
      type: string;
      url: string | null;
      path: string | null;
      fileName: string | null;
      description: string;
      date: string | null;
    }[];
  }[];
  verification: {
    kind: string | null;
    method: string | null;
    status: string;
    email: string | null;
    documentPath: string | null;
    documentFileName: string | null;
    submittedAt: string | null;
    verifiedAt: string | null;
  };
}

export interface LicenseUser {
  id: string;
  name: string;
  avatar_url: string | null;
}

export interface LicenseSubmissionSummary {
  id: string;
  kind: LicenseKind;
  status: LicenseReviewStatus;
  submitted_at: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  user: LicenseUser;
  institution_name: string;
  skill_names: string[];
  verification_status: string;
}

export interface LicenseSubmissionDetail {
  id: string;
  kind: LicenseKind;
  status: LicenseReviewStatus | 'draft';
  payload: LicensePayload;
  submitted_at: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  user: LicenseUser;
  /** The approved license the edit would replace (null for a new license). */
  live: { payload: LicensePayload; approved_at: string } | null;
  /** storage path → URL (signed for private files, public for the photo) */
  file_urls: Record<string, string>;
}
