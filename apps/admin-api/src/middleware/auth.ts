import { Request, Response, NextFunction } from 'express';
import { supabaseAuth, supabaseAdmin } from '../lib/supabase';

declare global {
  namespace Express {
    interface Request {
      user: { id: string; email?: string };
      adminRole: 'developer' | 'moderator';
    }
  }
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }
  const token = authHeader.slice(7);
  const { data, error } = await supabaseAuth.auth.getUser(token);
  if (error || !data.user) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }
  req.user = { id: data.user.id, email: data.user.email ?? undefined };
  next();
}

export async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from('admin_users')
    .select('role')
    .eq('user_id', req.user.id)
    .single();
  if (error || !data) {
    res.status(403).json({ error: 'Access denied: not an admin' });
    return;
  }
  req.adminRole = data.role as 'developer' | 'moderator';
  next();
}

export function requireDeveloper(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (req.adminRole !== 'developer') {
    res.status(403).json({ error: 'Access denied: developer role required' });
    return;
  }
  next();
}
