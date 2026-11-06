import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { supabaseAdmin } from '../lib/supabase';
import { paginationSchema, uuidSchema } from '../validation/common';
import { z } from 'zod';

// User-created skills awaiting review (skill_nodes.status = 'pending').
// Deciding also writes a row into `notifications` for the creator.
// A skill may come with a new category the user suggested (a pending non-leaf
// parent). It isn't reviewed on its own: it's approved / rejected with its skill.
export const skillsRouter = Router();

const statusSchema = z.enum(['pending', 'approved', 'rejected']).default('pending');

const rejectSchema = z.object({
  reason: z.string().trim().min(1, 'Reason is required').max(1000),
  duplicate_of: z.string().uuid().nullish(),
});

const searchSchema = z.object({
  q: z.string().trim().min(1).max(60),
});

interface NodeRow {
  id: string;
  name: string;
  status: string;
  parent_id: string | null;
  is_leaf: boolean;
}

// Approved skills that look like `name` (same RPC the web search uses).
// Service role bypasses RLS, so non-approved rows are filtered here.
async function findSimilar(name: string, excludeId?: string) {
  const { data, error } = await supabaseAdmin.rpc('search_skill_nodes', { p_query: name, p_limit: 12 });
  if (error) throw error;
  const rows = ((data ?? []) as NodeRow[])
    .filter((n) => n.status === 'approved' && n.id !== excludeId)
    .slice(0, 6);

  const parentIds = [...new Set(rows.map((n) => n.parent_id).filter(Boolean) as string[])];
  const parentNames = await nameMap('skill_nodes', 'name', parentIds);
  return rows.map((n) => ({
    id: n.id,
    name: n.name,
    is_leaf: n.is_leaf,
    parent_name: n.parent_id ? parentNames[n.parent_id] ?? null : null,
  }));
}

// Parents of listed skills: name, status (pending = suggested category) and where they sit
async function parentInfo(ids: string[]) {
  const map: Record<string, { name: string; status: string; parent_name: string | null }> = {};
  if (ids.length === 0) return map;
  const { data, error } = await supabaseAdmin.from('skill_nodes').select('id, name, status, parent_id').in('id', ids);
  if (error) throw error;
  const rows = (data ?? []) as NodeRow[];
  const grandNames = await nameMap('skill_nodes', 'name', [
    ...new Set(rows.filter((r) => r.status !== 'approved' && r.parent_id).map((r) => r.parent_id as string)),
  ]);
  for (const r of rows) {
    map[r.id] = { name: r.name, status: r.status, parent_name: r.parent_id ? grandNames[r.parent_id] ?? null : null };
  }
  return map;
}

async function nameMap(table: 'skill_nodes' | 'profiles', column: 'name' | 'username', ids: string[]) {
  const map: Record<string, string | null> = {};
  if (ids.length === 0) return map;
  const { data, error } = await supabaseAdmin.from(table).select(`id, ${column}`).in('id', ids);
  if (error) throw error;
  for (const row of (data ?? []) as unknown as Array<Record<string, string | null>>) {
    map[row.id as string] = row[column];
  }
  return map;
}

// GET /skills?status=pending&page=1&limit=20
skillsRouter.get('/', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { page, limit } = paginationSchema.parse(req.query);
    const status = statusSchema.parse(req.query.status);
    const offset = (page - 1) * limit;

    let query = supabaseAdmin
      .from('skill_nodes')
      .select(
        'id, name, slug, parent_id, status, created_by, show_creator, created_at, reviewed_at, rejection_reason, duplicate_of',
        { count: 'exact' }
      )
      .eq('status', status)
      .eq('is_leaf', true) // suggested categories ride along with their skill
      .order(status === 'pending' ? 'created_at' : 'reviewed_at', { ascending: false })
      .range(offset, offset + limit - 1);
    // Every original tree node is 'approved' too; only reviewed ones came from users.
    // (Not filtering on created_by: it becomes null when the creator deletes their account.)
    if (status !== 'pending') query = query.not('reviewed_at', 'is', null);

    const { data, error, count } = await query;
    if (error) throw error;

    const rows = data ?? [];
    const parents = await parentInfo([...new Set(rows.map((r) => r.parent_id).filter(Boolean) as string[])]);
    const duplicateNames = await nameMap(
      'skill_nodes',
      'name',
      [...new Set(rows.map((r) => r.duplicate_of).filter(Boolean) as string[])]
    );
    const usernames = await nameMap(
      'profiles',
      'username',
      [...new Set(rows.map((r) => r.created_by).filter(Boolean) as string[])]
    );

    // Similar existing skills only matter while the admin still has to decide
    const enriched = await Promise.all(
      rows.map(async (r) => ({
        ...r,
        parent_name: r.parent_id ? parents[r.parent_id]?.name ?? null : null,
        // the parent is a category the user suggested with this skill
        parent_is_new: r.parent_id ? parents[r.parent_id]?.status !== 'approved' : false,
        parent_parent_name: r.parent_id ? parents[r.parent_id]?.parent_name ?? null : null,
        duplicate_of_name: r.duplicate_of ? duplicateNames[r.duplicate_of] ?? null : null,
        creator_username: r.created_by ? usernames[r.created_by] ?? null : null,
        similar: status === 'pending' ? await findSimilar(r.name, r.id) : [],
      }))
    );

    res.json({ data: enriched, total: count, page, limit });
  } catch (err) {
    next(err);
  }
});

// GET /skills/search?q=… — lets the admin pick "duplicate of" beyond the suggestions
skillsRouter.get('/search', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { q } = searchSchema.parse(req.query);
    res.json({ data: await findSimilar(q) });
  } catch (err) {
    next(err);
  }
});

// POST /skills/:id/approve
skillsRouter.post('/:id/approve', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const id = uuidSchema.parse(req.params.id);

    const { data: existing, error: loadErr } = await supabaseAdmin
      .from('skill_nodes')
      .select('id, name, status, created_by')
      .eq('id', id)
      .single();

    if (loadErr || !existing) {
      res.status(404).json({ error: 'Skill not found' });
      return;
    }
    if (existing.status !== 'pending') {
      res.status(409).json({ error: 'Skill is not pending' });
      return;
    }

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('skill_nodes')
      .update({ status: 'approved', reviewed_by: req.user.id, reviewed_at: new Date().toISOString() })
      .eq('id', id)
      .eq('status', 'pending') // guards against a concurrent decision
      .select()
      .single();
    if (updateErr) throw updateErr;

    const { error: auditErr } = await supabaseAdmin.from('admin_audit_log').insert({
      actor_user_id: req.user.id,
      action: 'approve_user_skill',
      entity_type: 'skill_node',
      entity_id: id,
      before_data: { status: 'pending' },
      after_data: { status: 'approved', name: existing.name },
    });
    if (auditErr) throw auditErr;

    // an approved skill can't live in a pending category → approve the suggested categories above it
    let parentId = updated.parent_id as string | null;
    while (parentId) {
      const { data: parent, error: parentErr } = await supabaseAdmin
        .from('skill_nodes')
        .select('id, parent_id, status')
        .eq('id', parentId)
        .single();
      if (parentErr) throw parentErr;
      if (parent.status !== 'pending') break;
      const { error: approveErr } = await supabaseAdmin
        .from('skill_nodes')
        .update({ status: 'approved', reviewed_by: req.user.id, reviewed_at: new Date().toISOString() })
        .eq('id', parent.id);
      if (approveErr) throw approveErr;
      parentId = parent.parent_id;
    }

    if (existing.created_by) {
      const { error: notifErr } = await supabaseAdmin.from('notifications').insert({
        user_id: existing.created_by,
        type: 'skill_approved',
        data: { skill_id: id, skill_name: existing.name },
      });
      if (notifErr) throw notifErr;
    }

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// POST /skills/:id/reject  { reason, duplicate_of? }
skillsRouter.post('/:id/reject', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const id = uuidSchema.parse(req.params.id);
    const { reason, duplicate_of } = rejectSchema.parse(req.body);

    const { data: existing, error: loadErr } = await supabaseAdmin
      .from('skill_nodes')
      .select('id, name, status, created_by, parent_id')
      .eq('id', id)
      .single();

    if (loadErr || !existing) {
      res.status(404).json({ error: 'Skill not found' });
      return;
    }
    if (existing.status !== 'pending') {
      res.status(409).json({ error: 'Skill is not pending' });
      return;
    }

    let duplicateName: string | null = null;
    if (duplicate_of) {
      const { data: dup } = await supabaseAdmin
        .from('skill_nodes')
        .select('name, status')
        .eq('id', duplicate_of)
        .maybeSingle();
      if (!dup || dup.status !== 'approved' || duplicate_of === id) {
        res.status(422).json({ error: 'Duplicate target must be an existing approved skill' });
        return;
      }
      duplicateName = dup.name;
    }

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('skill_nodes')
      .update({
        status: 'rejected',
        reviewed_by: req.user.id,
        reviewed_at: new Date().toISOString(),
        rejection_reason: reason,
        duplicate_of: duplicate_of ?? null,
      })
      .eq('id', id)
      .eq('status', 'pending')
      .select()
      .single();
    if (updateErr) throw updateErr;

    // The node stays as history, but nobody keeps a rejected skill in their profile
    const { error: attrErr } = await supabaseAdmin.from('user_skill_attributes').delete().eq('skill_node_id', id);
    if (attrErr) throw attrErr;
    const { error: usErr } = await supabaseAdmin.from('user_skills').delete().eq('skill_node_id', id);
    if (usErr) throw usErr;

    // a suggested category left without any other skill goes with it
    if (existing.parent_id) {
      const { data: parent } = await supabaseAdmin
        .from('skill_nodes')
        .select('id, status')
        .eq('id', existing.parent_id)
        .maybeSingle();
      if (parent?.status === 'pending') {
        const { count, error: countErr } = await supabaseAdmin
          .from('skill_nodes')
          .select('id', { count: 'exact', head: true })
          .eq('parent_id', parent.id)
          .neq('status', 'rejected');
        if (countErr) throw countErr;
        if (count === 0) {
          const { error: catErr } = await supabaseAdmin
            .from('skill_nodes')
            .update({
              status: 'rejected',
              reviewed_by: req.user.id,
              reviewed_at: new Date().toISOString(),
              rejection_reason: reason,
            })
            .eq('id', parent.id);
          if (catErr) throw catErr;
        }
      }
    }

    const { error: auditErr } = await supabaseAdmin.from('admin_audit_log').insert({
      actor_user_id: req.user.id,
      action: 'reject_user_skill',
      entity_type: 'skill_node',
      entity_id: id,
      before_data: { status: 'pending' },
      after_data: { status: 'rejected', name: existing.name, reason, duplicate_of: duplicate_of ?? null },
    });
    if (auditErr) throw auditErr;

    if (existing.created_by) {
      const { error: notifErr } = await supabaseAdmin.from('notifications').insert({
        user_id: existing.created_by,
        type: 'skill_rejected',
        data: {
          skill_name: existing.name,
          reason,
          ...(duplicate_of && { duplicate_of_id: duplicate_of, duplicate_of_name: duplicateName }),
        },
      });
      if (notifErr) throw notifErr;
    }

    res.json(updated);
  } catch (err) {
    next(err);
  }
});
