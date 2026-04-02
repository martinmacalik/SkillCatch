import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { supabaseAdmin } from '../lib/supabase';
import { paginationSchema } from '../validation/common';
import { z } from 'zod';

export const auditRouter = Router();

const entityTypeSchema = z.string().min(1).optional();

// GET /audit?entity_type=node_restructure_request&page=1
auditRouter.get('/', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { page, limit } = paginationSchema.parse(req.query);
    const entityType = entityTypeSchema.parse(req.query.entity_type);
    const offset = (page - 1) * limit;

    let query = supabaseAdmin
      .from('admin_audit_log')
      .select('*, actor:profiles(username)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (entityType) query = query.eq('entity_type', entityType);

    const { data, error, count } = await query;
    if (error) throw error;
    res.json({ data, total: count, page, limit });
  } catch (err) {
    next(err);
  }
});
