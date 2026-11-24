import { supabase } from '@/lib/supabaseClient'

/*
 * global_search RPC (migration 20261125001_global_search): top matches +
 * total count per category in one call. RLS applies.
 */

export type ServerCategory = 'my_skills' | 'new_skills' | 'people' | 'teachers'

export interface MySkillHit {
  id: string
  name: string
  image_url: string | null
  status: 'watchlist' | 'learning' | 'learned' | 'dormant'
  pinned: boolean
}
export interface NewSkillHit {
  id: string
  name: string
  image_url: string | null
  parent_name: string | null
}
export interface PersonHit {
  id: string
  name: string
  username: string | null
  avatar_url: string | null
}
export interface TeacherHit {
  user_id: string
  name: string
  avatar_url: string | null
  skill_id: string
  skill_name: string
  level: 'intermediate' | 'advanced' | 'expert'
}

interface Bucket<T> {
  count: number
  items: T[]
}

export interface ServerResults {
  my_skills?: Bucket<MySkillHit>
  new_skills?: Bucket<NewSkillHit>
  people?: Bucket<PersonHit>
  teachers?: Bucket<TeacherHit>
}

/** limit = items per category; only = just one category (drill-down). */
export async function globalSearch(query: string, limit: number, only: ServerCategory | null): Promise<ServerResults> {
  const { data, error } = await supabase.rpc('global_search', { p_query: query, p_limit: limit, p_only: only })
  if (error) throw error
  return (data ?? {}) as ServerResults
}
