import { supabase } from './supabaseClient';
import type {
  RestructureRequest,
  SupportMessage,
  AuditLogEntry,
  LearningSuggestion,
  UserCreatedSkill,
  SimilarSkill,
  PaginatedResponse,
} from '../types/api';

const BASE_URL = import.meta.env.VITE_ADMIN_API_URL as string;

class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new ApiError('Not authenticated', 401);

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Unknown error' }));
    const message = body.detail ? `${body.error}: ${body.detail}` : (body.error ?? 'Request failed');
    throw new ApiError(message, res.status);
  }

  return res.json() as Promise<T>;
}

export const api = {
  getRequests: (params?: { status?: string; page?: number; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.status) q.set('status', params.status);
    if (params?.page) q.set('page', String(params.page));
    if (params?.limit) q.set('limit', String(params.limit));
    return apiFetch<PaginatedResponse<RestructureRequest>>(`/requests?${q}`);
  },

  approveRequest: (id: string) =>
    apiFetch<RestructureRequest>(`/requests/${id}/approve`, { method: 'POST' }),

  denyRequest: (id: string, denial_reason: string) =>
    apiFetch<RestructureRequest>(`/requests/${id}/deny`, {
      method: 'POST',
      body: JSON.stringify({ denial_reason }),
    }),

  getMessages: (params?: { status?: string; page?: number }) => {
    const q = new URLSearchParams();
    if (params?.status) q.set('status', params.status);
    if (params?.page) q.set('page', String(params.page));
    return apiFetch<PaginatedResponse<SupportMessage>>(`/messages?${q}`);
  },

  closeMessage: (id: string) =>
    apiFetch<SupportMessage>(`/messages/${id}/close`, { method: 'POST' }),

  openMessage: (id: string) =>
    apiFetch<SupportMessage>(`/messages/${id}/open`, { method: 'POST' }),

  getSuggestions: (params?: { status?: string; page?: number; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.status) q.set('status', params.status);
    if (params?.page) q.set('page', String(params.page));
    if (params?.limit) q.set('limit', String(params.limit));
    return apiFetch<PaginatedResponse<LearningSuggestion>>(`/suggestions?${q}`);
  },

  approveSuggestion: (id: string) =>
    apiFetch<LearningSuggestion>(`/suggestions/${id}/approve`, { method: 'POST' }),

  denySuggestion: (id: string, deny_reason: string) =>
    apiFetch<LearningSuggestion>(`/suggestions/${id}/deny`, {
      method: 'POST',
      body: JSON.stringify({ deny_reason }),
    }),

  getUserSkills: (params?: { status?: string; page?: number; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.status) q.set('status', params.status);
    if (params?.page) q.set('page', String(params.page));
    if (params?.limit) q.set('limit', String(params.limit));
    return apiFetch<PaginatedResponse<UserCreatedSkill>>(`/skills?${q}`);
  },

  searchSkills: (q: string) =>
    apiFetch<{ data: SimilarSkill[] }>(`/skills/search?${new URLSearchParams({ q })}`),

  approveUserSkill: (id: string) =>
    apiFetch<UserCreatedSkill>(`/skills/${id}/approve`, { method: 'POST' }),

  rejectUserSkill: (id: string, reason: string, duplicate_of: string | null) =>
    apiFetch<UserCreatedSkill>(`/skills/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason, duplicate_of }),
    }),

  getAuditLog: (params?: { entity_type?: string; page?: number }) => {
    const q = new URLSearchParams();
    if (params?.entity_type) q.set('entity_type', params.entity_type);
    if (params?.page) q.set('page', String(params.page));
    return apiFetch<PaginatedResponse<AuditLogEntry>>(`/audit?${q}`);
  },
};

export { ApiError };
