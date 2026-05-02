-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.admin_audit_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  actor_user_id uuid,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT admin_audit_log_pkey PRIMARY KEY (id),
  CONSTRAINT admin_audit_log_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.admin_users (
  user_id uuid NOT NULL,
  role text NOT NULL CHECK (role = ANY (ARRAY['developer'::text, 'moderator'::text])),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid,
  CONSTRAINT admin_users_pkey PRIMARY KEY (user_id),
  CONSTRAINT admin_users_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT admin_users_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id)
);
CREATE TABLE public.node_restructure_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  requester_user_id uuid,
  target_node_id uuid,
  proposal jsonb NOT NULL DEFAULT '{}'::jsonb,
  proposal_version integer NOT NULL DEFAULT 1,
  message text,
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'denied'::text])),
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  denial_reason text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT node_restructure_requests_pkey PRIMARY KEY (id),
  CONSTRAINT node_restructure_requests_requester_user_id_fkey FOREIGN KEY (requester_user_id) REFERENCES auth.users(id),
  CONSTRAINT node_restructure_requests_target_node_id_fkey FOREIGN KEY (target_node_id) REFERENCES public.skill_nodes(id),
  CONSTRAINT node_restructure_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id)
);
CREATE TABLE public.profile_cards (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  position integer NOT NULL DEFAULT 0,
  type text NOT NULL CHECK (type = ANY (ARRAY['text'::text, 'text_photo'::text, 'photo'::text, 'skills'::text, 'cv'::text])),
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT profile_cards_pkey PRIMARY KEY (id),
  CONSTRAINT profile_cards_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.profiles (
  id uuid NOT NULL,
  first_name text,
  last_name text,
  username text UNIQUE CHECK (username IS NULL OR username ~ '^[a-z0-9_-]{3,30}$'::text),
  avatar_url text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  bio text CHECK (char_length(bio) <= 160),
  country text,
  city text,
  primary_language text,
  theme text NOT NULL DEFAULT 'system'::text CHECK (theme = ANY (ARRAY['light'::text, 'dark'::text, 'system'::text])),
  notif_weekly_digest boolean NOT NULL DEFAULT true,
  notif_qa_answers boolean NOT NULL DEFAULT true,
  notif_proposal_updates boolean NOT NULL DEFAULT true,
  skillcoin_balance integer NOT NULL DEFAULT 0 CHECK (skillcoin_balance >= 0),
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);
CREATE TABLE public.skill_attribute_defs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  skill_node_id uuid NOT NULL,
  key text NOT NULL,
  label text NOT NULL,
  type text NOT NULL CHECK (type = ANY (ARRAY['number'::text, 'text'::text, 'enum'::text, 'date'::text, 'boolean'::text, 'multiselect'::text, 'multi'::text])),
  unit text,
  required boolean NOT NULL DEFAULT false,
  enum_values ARRAY,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT skill_attribute_defs_pkey PRIMARY KEY (id),
  CONSTRAINT skill_attribute_defs_skill_node_id_fkey FOREIGN KEY (skill_node_id) REFERENCES public.skill_nodes(id)
);
CREATE TABLE public.skill_learning_blocks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL,
  type text NOT NULL CHECK (type = ANY (ARRAY['heading'::text, 'text'::text, 'callout'::text, 'resource_list'::text, 'flashcards'::text, 'checklist'::text])),
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid,
  updated_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT skill_learning_blocks_pkey PRIMARY KEY (id),
  CONSTRAINT skill_learning_blocks_page_id_fkey FOREIGN KEY (page_id) REFERENCES public.skill_learning_pages(id),
  CONSTRAINT skill_learning_blocks_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id),
  CONSTRAINT skill_learning_blocks_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id)
);
CREATE TABLE public.skill_learning_pages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  skill_node_id uuid NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'draft'::text CHECK (status = ANY (ARRAY['draft'::text, 'published'::text])),
  created_by uuid,
  updated_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT skill_learning_pages_pkey PRIMARY KEY (id),
  CONSTRAINT skill_learning_pages_skill_node_id_fkey FOREIGN KEY (skill_node_id) REFERENCES public.skill_nodes(id),
  CONSTRAINT skill_learning_pages_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id),
  CONSTRAINT skill_learning_pages_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id)
);
CREATE TABLE public.skill_learning_suggestions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  skill_node_id uuid NOT NULL,
  submitted_by uuid NOT NULL,
  proposed_blocks jsonb NOT NULL DEFAULT '[]'::jsonb,
  message text,
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'denied'::text])),
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  deny_reason text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT skill_learning_suggestions_pkey PRIMARY KEY (id),
  CONSTRAINT skill_learning_suggestions_skill_node_id_fkey FOREIGN KEY (skill_node_id) REFERENCES public.skill_nodes(id),
  CONSTRAINT skill_learning_suggestions_submitted_by_fkey FOREIGN KEY (submitted_by) REFERENCES auth.users(id),
  CONSTRAINT skill_learning_suggestions_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id)
);
CREATE TABLE public.skill_node_parents (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  child_node_id uuid NOT NULL,
  parent_node_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT skill_node_parents_pkey PRIMARY KEY (id),
  CONSTRAINT skill_node_parents_child_node_id_fkey FOREIGN KEY (child_node_id) REFERENCES public.skill_nodes(id),
  CONSTRAINT skill_node_parents_parent_node_id_fkey FOREIGN KEY (parent_node_id) REFERENCES public.skill_nodes(id)
);
CREATE TABLE public.skill_nodes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL,
  parent_id uuid,
  path USER-DEFINED NOT NULL,
  is_leaf boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  image_url text,
  CONSTRAINT skill_nodes_pkey PRIMARY KEY (id),
  CONSTRAINT skill_nodes_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.skill_nodes(id)
);
CREATE TABLE public.skill_resources (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  skill_node_id uuid NOT NULL,
  title text NOT NULL,
  url text NOT NULL,
  kind text NOT NULL DEFAULT 'link'::text CHECK (kind = ANY (ARRAY['link'::text, 'video'::text, 'book'::text, 'course'::text, 'other'::text])),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT skill_resources_pkey PRIMARY KEY (id),
  CONSTRAINT skill_resources_skill_node_id_fkey FOREIGN KEY (skill_node_id) REFERENCES public.skill_nodes(id)
);
CREATE TABLE public.skill_stats (
  skill_node_id uuid NOT NULL,
  num_users bigint NOT NULL DEFAULT 0,
  num_teachers bigint NOT NULL DEFAULT 0,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT skill_stats_pkey PRIMARY KEY (skill_node_id),
  CONSTRAINT skill_stats_skill_node_id_fkey FOREIGN KEY (skill_node_id) REFERENCES public.skill_nodes(id)
);
CREATE TABLE public.skillcoin_transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount integer NOT NULL,
  reason text NOT NULL,
  reference_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT skillcoin_transactions_pkey PRIMARY KEY (id),
  CONSTRAINT skillcoin_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.support_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  sender_user_id uuid,
  email text,
  subject text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'open'::text CHECK (status = ANY (ARRAY['open'::text, 'closed'::text])),
  handled_by uuid,
  handled_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT support_messages_pkey PRIMARY KEY (id),
  CONSTRAINT support_messages_sender_user_id_fkey FOREIGN KEY (sender_user_id) REFERENCES auth.users(id),
  CONSTRAINT support_messages_handled_by_fkey FOREIGN KEY (handled_by) REFERENCES auth.users(id)
);
CREATE TABLE public.teaching_offers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  skill_node_id uuid NOT NULL,
  mode text NOT NULL CHECK (mode = ANY (ARRAY['online'::text, 'in_person'::text, 'hybrid'::text])),
  location text,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT teaching_offers_pkey PRIMARY KEY (id),
  CONSTRAINT teaching_offers_skill_node_id_fkey FOREIGN KEY (skill_node_id) REFERENCES public.skill_nodes(id),
  CONSTRAINT teaching_offers_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.user_login_days (
  user_id uuid NOT NULL,
  login_date date NOT NULL,
  CONSTRAINT user_login_days_pkey PRIMARY KEY (user_id, login_date),
  CONSTRAINT user_login_days_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.user_roles (
  user_id uuid NOT NULL,
  role text NOT NULL CHECK (role = ANY (ARRAY['admin'::text, 'editor'::text])),
  granted_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT user_roles_pkey PRIMARY KEY (user_id, role),
  CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.user_skill_attributes (
  user_id uuid NOT NULL,
  skill_node_id uuid NOT NULL,
  attribute_def_id uuid NOT NULL,
  value_json jsonb NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT user_skill_attributes_pkey PRIMARY KEY (user_id, skill_node_id, attribute_def_id),
  CONSTRAINT user_skill_attributes_skill_node_id_fkey FOREIGN KEY (skill_node_id) REFERENCES public.skill_nodes(id),
  CONSTRAINT user_skill_attributes_attribute_def_id_fkey FOREIGN KEY (attribute_def_id) REFERENCES public.skill_attribute_defs(id),
  CONSTRAINT user_skill_attributes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.user_skill_notes (
  user_id uuid NOT NULL,
  skill_node_id uuid NOT NULL,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT user_skill_notes_pkey PRIMARY KEY (user_id, skill_node_id),
  CONSTRAINT user_skill_notes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT user_skill_notes_skill_node_id_fkey FOREIGN KEY (skill_node_id) REFERENCES public.skill_nodes(id)
);
CREATE TABLE public.user_skills (
  user_id uuid NOT NULL,
  skill_node_id uuid NOT NULL,
  started_at date,
  level text,
  is_teaching boolean NOT NULL DEFAULT false,
  visibility text NOT NULL DEFAULT 'public'::text CHECK (visibility = ANY (ARRAY['public'::text, 'friends'::text, 'private'::text])),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'watchlist'::text CHECK (status = ANY (ARRAY['watchlist'::text, 'learning'::text, 'learned'::text, 'dormant'::text])),
  pinned boolean NOT NULL DEFAULT false,
  last_opened_at timestamp with time zone,
  CONSTRAINT user_skills_pkey PRIMARY KEY (user_id, skill_node_id),
  CONSTRAINT user_skills_skill_node_id_fkey FOREIGN KEY (skill_node_id) REFERENCES public.skill_nodes(id),
  CONSTRAINT user_skills_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);