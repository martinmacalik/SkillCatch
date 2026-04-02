import { createClient } from '@supabase/supabase-js';
import { env } from './env';

// Used only for JWT verification via auth.getUser()
// Never used for data queries
export const supabaseAuth = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

// Used for all privileged data operations
// Never referenced from any frontend code
export const supabaseAdmin = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);
