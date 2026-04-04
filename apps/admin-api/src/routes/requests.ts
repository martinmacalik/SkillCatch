import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { supabaseAdmin } from '../lib/supabase';
import { validateProposal } from '../validation/proposal';
import { denyRequestSchema } from '../validation/requests';
import { paginationSchema, requestStatusSchema, uuidSchema } from '../validation/common';
import { ZodError } from 'zod';

export const requestsRouter = Router();

// GET /requests?status=pending&page=1&limit=20
requestsRouter.get('/', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { page, limit } = paginationSchema.parse(req.query);
    const status = requestStatusSchema.parse(req.query.status);
    const offset = (page - 1) * limit;

    let query = supabaseAdmin
      .from('node_restructure_requests')
      .select(
        '*, target_node:skill_nodes(id, name, slug, path)',
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) query = query.eq('status', status);

    const { data, error, count } = await query;
    if (error) throw error;
    res.json({ data, total: count, page, limit });
  } catch (err) {
    next(err);
  }
});

// GET /requests/:id
requestsRouter.get('/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const id = uuidSchema.parse(req.params.id);
    const { data, error } = await supabaseAdmin
      .from('node_restructure_requests')
      .select(
        '*, target_node:skill_nodes(id, name, slug, path)'
      )
      .eq('id', id)
      .single();
    if (error) {
      if (error.code === 'PGRST116') {
        res.status(404).json({ error: 'Request not found' });
        return;
      }
      throw error;
    }
    if (!data) {
      res.status(404).json({ error: 'Request not found' });
      return;
    }
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// POST /requests/:id/approve
requestsRouter.post('/:id/approve', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const id = uuidSchema.parse(req.params.id);

    const { data: existing, error: loadErr } = await supabaseAdmin
      .from('node_restructure_requests')
      .select('*')
      .eq('id', id)
      .single();

    if (loadErr || !existing) {
      res.status(404).json({ error: 'Request not found' });
      return;
    }
    if (existing.status !== 'pending') {
      res.status(409).json({ error: 'Request is not pending' });
      return;
    }

    try {
      validateProposal(existing.proposal);
    } catch (e) {
      if (e instanceof ZodError) {
        res.status(422).json({ error: 'Invalid proposal shape', details: e.errors });
        return;
      }
      throw e;
    }

    const { error: rpcErr } = await supabaseAdmin.rpc(
      'approve_restructure_request',
      { p_request_id: id, p_actor_user_id: req.user.id }
    );

    if (rpcErr) {
      if (rpcErr.message?.includes('request_not_pending')) {
        res.status(409).json({ error: 'Request is not pending' });
        return;
      }
      if (rpcErr.message?.includes('unsupported_proposal_type')) {
        res.status(422).json({ error: 'Proposal type not yet supported for auto-approval' });
        return;
      }
      throw rpcErr;
    }

    const { data: updated } = await supabaseAdmin
      .from('node_restructure_requests')
      .select('*')
      .eq('id', id)
      .single();

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// POST /requests/:id/deny
requestsRouter.post('/:id/deny', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const id = uuidSchema.parse(req.params.id);
    const { denial_reason } = denyRequestSchema.parse(req.body);

    const { data: existing, error: loadErr } = await supabaseAdmin
      .from('node_restructure_requests')
      .select('status, proposal')
      .eq('id', id)
      .single();

    if (loadErr || !existing) {
      res.status(404).json({ error: 'Request not found' });
      return;
    }
    if (existing.status !== 'pending') {
      res.status(409).json({ error: 'Request is not pending' });
      return;
    }

    const { error: auditErr } = await supabaseAdmin
      .from('admin_audit_log')
      .insert({
        actor_user_id: req.user.id,
        action: 'deny_restructure_request',
        entity_type: 'node_restructure_request',
        entity_id: id,
        before_data: { status: 'pending' },
        after_data: { status: 'denied', denial_reason },
      });
    if (auditErr) throw auditErr;

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('node_restructure_requests')
      .update({
        status: 'denied',
        reviewed_by: req.user.id,
        reviewed_at: new Date().toISOString(),
        denial_reason,
      })
      .eq('id', id)
      .select()
      .single();

    if (updateErr) throw updateErr;
    res.json(updated);
  } catch (err) {
    next(err);
  }
});
