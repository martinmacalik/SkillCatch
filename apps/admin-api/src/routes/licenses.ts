import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { supabaseAdmin } from '../lib/supabase';
import { uuidSchema } from '../validation/common';

// Teaching licenses waiting for review (teacher_license_submissions).
//   kind 'new'  = first license,  kind 'edit' = change of an approved one
// Approve runs approve_license_submission() (one transaction: live tables,
// submission, audit log, notification). Reject is done here.
export const licensesRouter = Router();

const PHOTO_BUCKET = 'license-photos';
const FILES_BUCKET = 'license-files';
const SIGNED_URL_SECONDS = 60 * 30;

const statusSchema = z.enum(['pending', 'approved', 'rejected']).default('pending');
const rejectSchema = z.object({
  reason: z.string().trim().min(1, 'Reason is required').max(1000),
});
// skills the admin leaves off the license; everything else in the submission is approved
const approveSchema = z
  .object({
    rejected_skills: z
      .array(
        z.object({
          skill_node_id: uuidSchema,
          reason: z.string().trim().min(1, 'Reason is required').max(500),
        }),
      )
      .max(50)
      .default([]),
  })
  .default({ rejected_skills: [] });

// Same shape as LicensePayload in apps/web/src/types/teaching.ts
interface PayloadEvidence {
  kind: 'image' | 'video' | 'pdf' | 'link';
  type: string;
  url: string | null;
  path: string | null;
  fileName: string | null;
  description: string;
  date: string | null;
}
interface Payload {
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
    evidence: PayloadEvidence[];
    /** Only on the live license: per-skill review result. */
    status?: 'approved' | 'rejected';
    rejectionReason?: string | null;
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

interface ProfileRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  avatar_url: string | null;
}

function displayName(p: ProfileRow | undefined): string {
  if (!p) return 'Unknown user';
  return [p.first_name, p.last_name].filter(Boolean).join(' ') || p.username || 'User';
}

async function profilesById(ids: string[]): Promise<Record<string, ProfileRow>> {
  if (ids.length === 0) return {};
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, first_name, last_name, username, avatar_url')
    .in('id', ids);
  if (error) throw error;
  return Object.fromEntries(((data ?? []) as ProfileRow[]).map((p) => [p.id, p]));
}

function filePaths(p: Payload | null): string[] {
  if (!p) return [];
  const paths = p.skills.flatMap((s) => s.evidence.map((e) => e.path).filter((x): x is string => !!x));
  if (p.verification?.documentPath) paths.push(p.verification.documentPath);
  return paths;
}

/** Private files → short-lived signed URLs, the photo → public URL. */
async function fileUrls(payloads: (Payload | null)[]): Promise<Record<string, string>> {
  const urls: Record<string, string> = {};
  const paths = [...new Set(payloads.flatMap(filePaths))];
  if (paths.length > 0) {
    const { data, error } = await supabaseAdmin.storage.from(FILES_BUCKET).createSignedUrls(paths, SIGNED_URL_SECONDS);
    if (error) throw error;
    for (const item of data ?? []) if (item.path && item.signedUrl) urls[item.path] = item.signedUrl;
  }
  for (const p of payloads) {
    if (p?.photoPath) urls[p.photoPath] = supabaseAdmin.storage.from(PHOTO_BUCKET).getPublicUrl(p.photoPath).data.publicUrl;
  }
  return urls;
}

interface LiveRow {
  title_before: string;
  title_after: string;
  role: string | null;
  country_code: string;
  institution_type: string | null;
  institution_id: string | null;
  institution_name: string;
  institution_domains: string[] | null;
  bio: string;
  photo_path: string | null;
  theme: string;
  approved_at: string;
  license_skills: {
    skill_node_id: string;
    level: string;
    sort_order: number;
    status: 'approved' | 'rejected';
    rejection_reason: string | null;
    skill_nodes: { name: string } | null;
    license_evidence: {
      kind: PayloadEvidence['kind'];
      type: string;
      url: string | null;
      storage_path: string | null;
      file_name: string | null;
      description: string;
      date: string | null;
      sort_order: number;
    }[];
  }[];
  educator_verifications:
    | {
        kind: string;
        method: string;
        status: string;
        email: string | null;
        document_path: string | null;
        document_file_name: string | null;
        submitted_at: string | null;
        verified_at: string | null;
      }
    | null;
}

/** The currently approved license in payload shape, so the admin UI can diff it. */
async function livePayload(userId: string): Promise<{ payload: Payload; approvedAt: string } | null> {
  const { data, error } = await supabaseAdmin
    .from('teacher_licenses')
    .select('*, license_skills(*, skill_nodes(name), license_evidence(*)), educator_verifications(*)')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as unknown as LiveRow;
  const v = Array.isArray(row.educator_verifications) ? row.educator_verifications[0] : row.educator_verifications;
  return {
    approvedAt: row.approved_at,
    payload: {
      titleBefore: row.title_before,
      titleAfter: row.title_after,
      role: row.role,
      countryCode: row.country_code,
      institutionType: row.institution_type,
      institutionId: row.institution_id,
      institutionName: row.institution_name,
      institutionDomains: row.institution_domains,
      bio: row.bio,
      photoPath: row.photo_path,
      theme: row.theme,
      skills: [...row.license_skills]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((s) => ({
          skillNodeId: s.skill_node_id,
          skillName: s.skill_nodes?.name ?? 'Skill',
          level: s.level,
          status: s.status,
          rejectionReason: s.rejection_reason,
          evidence: [...s.license_evidence]
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((e) => ({
              kind: e.kind,
              type: e.type,
              url: e.url,
              path: e.storage_path,
              fileName: e.file_name,
              description: e.description,
              date: e.date,
            })),
        })),
      verification: v
        ? {
            kind: v.kind,
            method: v.method,
            status: v.status,
            email: v.email,
            documentPath: v.document_path,
            documentFileName: v.document_file_name,
            submittedAt: v.submitted_at,
            verifiedAt: v.verified_at,
          }
        : {
            kind: null, method: null, status: 'none', email: null, documentPath: null,
            documentFileName: null, submittedAt: null, verifiedAt: null,
          },
    },
  };
}

// GET /licenses?status=pending → list (the UI splits it into New / Edits columns)
licensesRouter.get('/', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const status = statusSchema.parse(req.query.status);
    const { data, error } = await supabaseAdmin
      .from('teacher_license_submissions')
      .select('id, user_id, kind, status, payload, submitted_at, reviewed_at, rejection_reason, updated_at')
      .eq('status', status)
      .order(status === 'pending' ? 'submitted_at' : 'reviewed_at', { ascending: status === 'pending' })
      .limit(200);
    if (error) throw error;

    const rows = (data ?? []) as {
      id: string; user_id: string; kind: 'new' | 'edit'; status: string; payload: Payload;
      submitted_at: string | null; reviewed_at: string | null; rejection_reason: string | null; updated_at: string;
    }[];
    const profiles = await profilesById([...new Set(rows.map((r) => r.user_id))]);

    res.json({
      data: rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        status: r.status,
        submitted_at: r.submitted_at,
        reviewed_at: r.reviewed_at,
        rejection_reason: r.rejection_reason,
        user: {
          id: r.user_id,
          name: displayName(profiles[r.user_id]),
          avatar_url: profiles[r.user_id]?.avatar_url ?? null,
        },
        institution_name: r.payload.institutionName,
        skill_names: r.payload.skills.map((s) => s.skillName),
        verification_status: r.payload.verification?.status ?? 'none',
      })),
    });
  } catch (err) {
    next(err);
  }
});

// GET /licenses/:id → full submission + the live license (for edits) + file URLs
licensesRouter.get('/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const id = uuidSchema.parse(req.params.id);
    const { data, error } = await supabaseAdmin
      .from('teacher_license_submissions')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      res.status(404).json({ error: 'Submission not found' });
      return;
    }
    const sub = data as { user_id: string; payload: Payload; kind: 'new' | 'edit' };
    const [profiles, live] = await Promise.all([profilesById([sub.user_id]), livePayload(sub.user_id)]);
    const urls = await fileUrls([sub.payload, live?.payload ?? null]);

    res.json({
      ...data,
      user: {
        id: sub.user_id,
        name: displayName(profiles[sub.user_id]),
        avatar_url: profiles[sub.user_id]?.avatar_url ?? null,
      },
      live: live ? { payload: live.payload, approved_at: live.approvedAt } : null,
      file_urls: urls,
    });
  } catch (err) {
    next(err);
  }
});

// POST /licenses/:id/approve  { rejected_skills?: [{ skill_node_id, reason }] }
licensesRouter.post('/:id/approve', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const id = uuidSchema.parse(req.params.id);
    const { rejected_skills } = approveSchema.parse(req.body ?? {});
    const { data: licenseId, error } = await supabaseAdmin.rpc('approve_license_submission', {
      p_submission_id: id,
      p_actor_user_id: req.user.id,
      p_rejected: rejected_skills.map((r) => ({ skillNodeId: r.skill_node_id, reason: r.reason })),
    });
    if (error) {
      if (error.message?.includes('submission_not_found')) {
        res.status(404).json({ error: 'Submission not found' });
        return;
      }
      if (error.message?.includes('submission_not_pending')) {
        res.status(409).json({ error: 'Submission is not pending' });
        return;
      }
      if (error.message?.includes('invalid_payload')) {
        res.status(422).json({ error: 'The license has no skills' });
        return;
      }
      if (error.message?.includes('no_approved_skills')) {
        res.status(422).json({ error: 'Approve at least one skill, or reject the whole license' });
        return;
      }
      throw error;
    }
    res.json({ id, status: 'approved', license_id: licenseId, rejected_skills: rejected_skills.length });
  } catch (err) {
    next(err);
  }
});

// POST /licenses/:id/reject  { reason }
licensesRouter.post('/:id/reject', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const id = uuidSchema.parse(req.params.id);
    const { reason } = rejectSchema.parse(req.body);

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('teacher_license_submissions')
      .update({
        status: 'rejected',
        reviewed_by: req.user.id,
        reviewed_at: new Date().toISOString(),
        rejection_reason: reason,
      })
      .eq('id', id)
      .eq('status', 'pending') // only a pending one; a parallel approve wins
      .select('id, user_id, kind')
      .maybeSingle();
    if (updateErr) throw updateErr;
    if (!updated) {
      res.status(409).json({ error: 'Submission is not pending' });
      return;
    }

    const { error: auditErr } = await supabaseAdmin.from('admin_audit_log').insert({
      actor_user_id: req.user.id,
      action: 'reject_license_submission',
      entity_type: 'teacher_license_submission',
      entity_id: id,
      before_data: { status: 'pending', kind: updated.kind },
      after_data: { status: 'rejected', reason },
    });
    if (auditErr) throw auditErr;

    const { error: notifErr } = await supabaseAdmin.from('notifications').insert({
      user_id: updated.user_id,
      type: 'license_rejected',
      data: { kind: updated.kind, reason },
    });
    if (notifErr) throw notifErr;

    res.json({ id, status: 'rejected' });
  } catch (err) {
    next(err);
  }
});
