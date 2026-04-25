-- The "Learning" column already exists on user_skills.status.
-- The user_learning_skills table from 20260425001 is redundant — drop it.
-- Personal notes (user_skill_notes) stay; that's still its own concept.

DROP TABLE IF EXISTS public.user_learning_skills;
