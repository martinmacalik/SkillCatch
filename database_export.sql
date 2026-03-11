-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.profiles (
  id uuid NOT NULL,
  first_name text,
  last_name text,
  username text UNIQUE,
  avatar_url text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);
CREATE TABLE public.skill_attribute_defs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  skill_node_id uuid NOT NULL,
  key text NOT NULL,
  label text NOT NULL,
  type text NOT NULL CHECK (type = ANY (ARRAY['number'::text, 'text'::text, 'enum'::text, 'date'::text, 'boolean'::text])),
  unit text,
  required boolean NOT NULL DEFAULT false,
  enum_values ARRAY,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT skill_attribute_defs_pkey PRIMARY KEY (id),
  CONSTRAINT skill_attribute_defs_skill_node_id_fkey FOREIGN KEY (skill_node_id) REFERENCES public.skill_nodes(id)
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
CREATE TABLE public.teaching_offers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  skill_node_id uuid NOT NULL,
  mode text NOT NULL CHECK (mode = ANY (ARRAY['online'::text, 'in_person'::text, 'hybrid'::text])),
  location text,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT teaching_offers_pkey PRIMARY KEY (id),
  CONSTRAINT teaching_offers_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT teaching_offers_skill_node_id_fkey FOREIGN KEY (skill_node_id) REFERENCES public.skill_nodes(id)
);
CREATE TABLE public.user_skill_attributes (
  user_id uuid NOT NULL,
  skill_node_id uuid NOT NULL,
  attribute_def_id uuid NOT NULL,
  value_json jsonb NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT user_skill_attributes_pkey PRIMARY KEY (user_id, skill_node_id, attribute_def_id),
  CONSTRAINT user_skill_attributes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT user_skill_attributes_skill_node_id_fkey FOREIGN KEY (skill_node_id) REFERENCES public.skill_nodes(id),
  CONSTRAINT user_skill_attributes_attribute_def_id_fkey FOREIGN KEY (attribute_def_id) REFERENCES public.skill_attribute_defs(id)
);
CREATE TABLE public.user_skills (
  user_id uuid NOT NULL,
  skill_node_id uuid NOT NULL,
  started_at date,
  level text,
  is_teaching boolean NOT NULL DEFAULT false,
  visibility text NOT NULL DEFAULT 'public'::text CHECK (visibility = ANY (ARRAY['public'::text, 'friends'::text, 'private'::text])),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT user_skills_pkey PRIMARY KEY (user_id, skill_node_id),
  CONSTRAINT user_skills_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT user_skills_skill_node_id_fkey FOREIGN KEY (skill_node_id) REFERENCES public.skill_nodes(id)
);