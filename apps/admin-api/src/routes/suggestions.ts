import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { supabaseAdmin } from '../lib/supabase';
import { paginationSchema, uuidSchema } from '../validation/common';
import { z } from 'zod';

export const suggestionsRouter = Router();

const statusSchema = z.enum(['pending', 'approved', 'denied']).optional();

const denySchema = z.object({
  deny_reason: z.string().min(1).max(1000),
});

// GET /suggestions?status=pending&page=1&limit=20
suggestionsRouter.get('/', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { page, limit } = paginationSchema.parse(req.query);
    const status = statusSchema.parse(req.query.status);
    const offset = (page - 1) * limit;

    let query = supabaseAdmin
      .from('skill_learning_suggestions')
      .select('*, skill_nodes(name)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) query = query.eq('status', status);

    const { data, error, count } = await query;
    if (error) throw error;

    // Enrich with submitter usernames
    const rows = data ?? [];
    const userIds = [...new Set(rows.map((r) => r.submitted_by as string))];
    let usernameMap: Record<string, string | null> = {};
    if (userIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from('profiles')
        .select('id, username')
        .in('id', userIds);
      for (const p of profiles ?? []) {
        usernameMap[(p as { id: string; username: string | null }).id] =
          (p as { id: string; username: string | null }).username;
      }
    }

    const enriched = rows.map((r) => ({
      ...r,
      skill_name:
        Array.isArray(r.skill_nodes)
          ? (r.skill_nodes[0] as { name: string } | undefined)?.name ?? null
          : (r.skill_nodes as { name: string } | null)?.name ?? null,
      submitter_username: usernameMap[r.submitted_by as string] ?? null,
      skill_nodes: undefined,
    }));

    res.json({ data: enriched, total: count, page, limit });
  } catch (err) {
    next(err);
  }
});

// POST /suggestions/:id/approve
suggestionsRouter.post('/:id/approve', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const id = uuidSchema.parse(req.params.id);

    const { data: suggestion, error: loadErr } = await supabaseAdmin
      .from('skill_learning_suggestions')
      .select('*')
      .eq('id', id)
      .single();

    if (loadErr || !suggestion) {
      res.status(404).json({ error: 'Suggestion not found' });
      return;
    }
    if (suggestion.status !== 'pending') {
      res.status(409).json({ error: 'Suggestion is not pending' });
      return;
    }

    // Find or create the skill_learning_page, always publishing it
    const { data: existingPage } = await supabaseAdmin
      .from('skill_learning_pages')
      .select('id')
      .eq('skill_node_id', suggestion.skill_node_id)
      .maybeSingle();

    let pageId: string;
    if (existingPage) {
      pageId = existingPage.id;
      const { error: pubErr } = await supabaseAdmin
        .from('skill_learning_pages')
        .update({ status: 'published', updated_by: req.user.id })
        .eq('id', pageId);
      if (pubErr) throw pubErr;
    } else {
      const { data: newPage, error: createErr } = await supabaseAdmin
        .from('skill_learning_pages')
        .insert({ skill_node_id: suggestion.skill_node_id, status: 'published', created_by: req.user.id })
        .select('id')
        .single();
      if (createErr || !newPage) throw createErr ?? new Error('Failed to create page');
      pageId = newPage.id;
    }

    // Fetch current live blocks for diff
    const { data: liveBlocks } = await supabaseAdmin
      .from('skill_learning_blocks')
      .select('id')
      .eq('page_id', pageId);

    const currentIds = new Set((liveBlocks ?? []).map((b) => (b as { id: string }).id));
    const proposedBlocks = suggestion.proposed_blocks as Array<{
      id?: string; type: string; content: Record<string, unknown>; sort_order: number;
    }>;
    const keptIds = new Set(proposedBlocks.filter((b) => b.id).map((b) => b.id as string));

    // Delete blocks removed from the proposal
    const toDelete = [...currentIds].filter((id) => !keptIds.has(id));
    if (toDelete.length > 0) {
      const { error: delErr } = await supabaseAdmin
        .from('skill_learning_blocks')
        .delete()
        .in('id', toDelete);
      if (delErr) throw delErr;
    }

    // Update kept blocks, insert new ones
    for (const block of proposedBlocks) {
      if (block.id && currentIds.has(block.id)) {
        const { error: updErr } = await supabaseAdmin
          .from('skill_learning_blocks')
          .update({ type: block.type, content: block.content, sort_order: block.sort_order, updated_by: req.user.id })
          .eq('id', block.id);
        if (updErr) throw updErr;
      } else {
        const { error: insErr } = await supabaseAdmin
          .from('skill_learning_blocks')
          .insert({ page_id: pageId, type: block.type, content: block.content, sort_order: block.sort_order, created_by: req.user.id });
        if (insErr) throw insErr;
      }
    }

    // Mark suggestion approved
    const { data: updated, error: markErr } = await supabaseAdmin
      .from('skill_learning_suggestions')
      .update({ status: 'approved', reviewed_by: req.user.id, reviewed_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (markErr) throw markErr;

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// POST /suggestions/:id/deny
suggestionsRouter.post('/:id/deny', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const id = uuidSchema.parse(req.params.id);
    const { deny_reason } = denySchema.parse(req.body);

    const { data: existing, error: loadErr } = await supabaseAdmin
      .from('skill_learning_suggestions')
      .select('status')
      .eq('id', id)
      .single();

    if (loadErr || !existing) {
      res.status(404).json({ error: 'Suggestion not found' });
      return;
    }
    if (existing.status !== 'pending') {
      res.status(409).json({ error: 'Suggestion is not pending' });
      return;
    }

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('skill_learning_suggestions')
      .update({ status: 'denied', deny_reason, reviewed_by: req.user.id, reviewed_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (updateErr) throw updateErr;

    res.json(updated);
  } catch (err) {
    next(err);
  }
});
