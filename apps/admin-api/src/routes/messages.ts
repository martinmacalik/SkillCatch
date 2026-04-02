import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { supabaseAdmin } from '../lib/supabase';
import { paginationSchema, messageStatusSchema, uuidSchema } from '../validation/common';

export const messagesRouter = Router();

// GET /messages?status=open&page=1
messagesRouter.get('/', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { page, limit } = paginationSchema.parse(req.query);
    const status = messageStatusSchema.parse(req.query.status);
    const offset = (page - 1) * limit;

    let query = supabaseAdmin
      .from('support_messages')
      .select('*, sender:profiles(username)', { count: 'exact' })
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

async function setMessageStatus(
  req: Request,
  res: Response,
  next: NextFunction,
  newStatus: 'open' | 'closed',
  action: string
) {
  try {
    const id = uuidSchema.parse(req.params.id);

    const { data: existing } = await supabaseAdmin
      .from('support_messages')
      .select('status')
      .eq('id', id)
      .single();

    if (!existing) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }

    const { error: auditErr } = await supabaseAdmin.from('admin_audit_log').insert({
      actor_user_id: req.user.id,
      action,
      entity_type: 'support_message',
      entity_id: id,
      before_data: { status: existing.status },
      after_data: { status: newStatus },
    });
    if (auditErr) throw auditErr;

    const { data: updated, error } = await supabaseAdmin
      .from('support_messages')
      .update({
        status: newStatus,
        handled_by: req.user.id,
        handled_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json(updated);
  } catch (err) {
    next(err);
  }
}

// POST /messages/:id/close
messagesRouter.post('/:id/close', requireAuth, requireAdmin, (req, res, next) =>
  setMessageStatus(req, res, next, 'closed', 'close_support_message')
);

// POST /messages/:id/open
messagesRouter.post('/:id/open', requireAuth, requireAdmin, (req, res, next) =>
  setMessageStatus(req, res, next, 'open', 'reopen_support_message')
);
