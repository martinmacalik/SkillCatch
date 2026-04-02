import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../lib/supabase', () => ({
  supabaseAuth: { auth: { getUser: vi.fn() } },
  supabaseAdmin: { from: vi.fn() },
}));

import { requireAuth, requireAdmin } from '../auth';
import { supabaseAuth, supabaseAdmin } from '../../lib/supabase';

function makeApp(...middleware: Parameters<typeof express.Router['prototype']['get']>[1][]) {
  const app = express();
  app.use(express.json());
  app.get('/test', ...(middleware as any[]), (_req: any, res: any) => res.json({ ok: true }));
  return app;
}

describe('requireAuth', () => {
  it('returns 401 when Authorization header is missing', async () => {
    const res = await request(makeApp(requireAuth)).get('/test');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/missing/i);
  });

  it('returns 401 when token is invalid', async () => {
    vi.mocked(supabaseAuth.auth.getUser).mockResolvedValueOnce({
      data: { user: null },
      error: new Error('invalid token'),
    } as any);
    const res = await request(makeApp(requireAuth))
      .get('/test')
      .set('Authorization', 'Bearer bad-token');
    expect(res.status).toBe(401);
  });

  it('attaches req.user and calls next() when token is valid', async () => {
    vi.mocked(supabaseAuth.auth.getUser).mockResolvedValueOnce({
      data: { user: { id: 'user-123', email: 'test@test.com' } },
      error: null,
    } as any);
    const app = express();
    app.use(express.json());
    app.get('/test', requireAuth as any, (req: any, res: any) =>
      res.json({ userId: req.user.id })
    );
    const res = await request(app)
      .get('/test')
      .set('Authorization', 'Bearer valid-token');
    expect(res.status).toBe(200);
    expect(res.body.userId).toBe('user-123');
  });
});

describe('requireAdmin', () => {
  beforeEach(() => {
    vi.mocked(supabaseAuth.auth.getUser).mockResolvedValue({
      data: { user: { id: 'user-123', email: 'test@test.com' } },
      error: null,
    } as any);
  });

  it('returns 403 when user is not in admin_users', async () => {
    vi.mocked(supabaseAdmin.from).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: new Error('not found') }),
        }),
      }),
    } as any);
    const res = await request(makeApp(requireAuth, requireAdmin))
      .get('/test')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(403);
  });

  it('attaches adminRole = "developer" for developer users', async () => {
    vi.mocked(supabaseAdmin.from).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { role: 'developer' }, error: null }),
        }),
      }),
    } as any);
    const app = express();
    app.use(express.json());
    app.get('/test', requireAuth as any, requireAdmin as any, (req: any, res: any) =>
      res.json({ role: req.adminRole })
    );
    const res = await request(app)
      .get('/test')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('developer');
  });

  it('attaches adminRole = "moderator" for moderator users', async () => {
    vi.mocked(supabaseAdmin.from).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { role: 'moderator' }, error: null }),
        }),
      }),
    } as any);
    const app = express();
    app.use(express.json());
    app.get('/test', requireAuth as any, requireAdmin as any, (req: any, res: any) =>
      res.json({ role: req.adminRole })
    );
    const res = await request(app)
      .get('/test')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('moderator');
  });
});

describe('requireDeveloper', () => {
  it('returns 403 for moderator role', async () => {
    vi.mocked(supabaseAuth.auth.getUser).mockResolvedValue({
      data: { user: { id: 'user-123', email: 'test@test.com' } },
      error: null,
    } as any);
    vi.mocked(supabaseAdmin.from).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { role: 'moderator' }, error: null }),
        }),
      }),
    } as any);
    const { requireDeveloper } = await import('../auth');
    const app = express();
    app.use(express.json());
    app.get('/test', requireAuth as any, requireAdmin as any, requireDeveloper as any, (_req: any, res: any) =>
      res.json({ ok: true })
    );
    const res = await request(app).get('/test').set('Authorization', 'Bearer token');
    expect(res.status).toBe(403);
  });
});
