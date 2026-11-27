-- Teach phase 1: assignments, submissions, review loop
-- Spec: docs/superpowers/specs/2026-11-27-teach-classroom-design.md (section 5)
--
-- A "class" = teacher + skill, members = teacher_students rows with status 'active'.
-- Reading goes through RLS; EVERY write goes through a SECURITY DEFINER RPC below
-- (no INSERT/UPDATE/DELETE policies), so the state machine can't be bypassed:
--   (no row) not started → submitted → returned → submitted → … → done
-- Idempotent: safe to run again.


-- ════════════════════════════════════════════════════════════════
-- TABLES
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.teach_assignments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  skill_node_id uuid NOT NULL REFERENCES public.skill_nodes(id) ON DELETE CASCADE,
  title         text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  instructions  text NOT NULL DEFAULT '' CHECK (char_length(instructions) <= 5000),
  due_at        timestamptz,
  audience      text NOT NULL DEFAULT 'group' CHECK (audience IN ('group', 'students')),
  attachments   jsonb NOT NULL DEFAULT '[]'::jsonb
                CHECK (jsonb_typeof(attachments) = 'array' AND jsonb_array_length(attachments) <= 10),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_teach_assignments_class
  ON public.teach_assignments(teacher_id, skill_node_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_teach_assignments_skill ON public.teach_assignments(skill_node_id);

-- only for audience = 'students'
CREATE TABLE IF NOT EXISTS public.teach_assignment_students (
  assignment_id uuid NOT NULL REFERENCES public.teach_assignments(id) ON DELETE CASCADE,
  student_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (assignment_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_teach_assignment_students_student ON public.teach_assignment_students(student_id);

CREATE TABLE IF NOT EXISTS public.teach_submissions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id      uuid NOT NULL REFERENCES public.teach_assignments(id) ON DELETE CASCADE,
  student_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status             text NOT NULL CHECK (status IN ('submitted', 'returned', 'done')),
  first_submitted_at timestamptz NOT NULL DEFAULT now(),  -- "late" is measured from this one
  submitted_at       timestamptz NOT NULL DEFAULT now(),  -- latest (re)submission
  reviewed_at        timestamptz,
  UNIQUE (assignment_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_teach_submissions_status ON public.teach_submissions(assignment_id, status);
CREATE INDEX IF NOT EXISTS idx_teach_submissions_student ON public.teach_submissions(student_id);

-- the thread: append-only
CREATE TABLE IF NOT EXISTS public.teach_submission_entries (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.teach_submissions(id) ON DELETE CASCADE,
  author_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind          text NOT NULL CHECK (kind IN ('submission', 'review', 'comment')),
  decision      text CHECK (decision IN ('done', 'returned')),
  body          text NOT NULL DEFAULT '' CHECK (char_length(body) <= 5000),
  attachments   jsonb NOT NULL DEFAULT '[]'::jsonb
                CHECK (jsonb_typeof(attachments) = 'array' AND jsonb_array_length(attachments) <= 10),
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind = 'review') = (decision IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_teach_entries_submission ON public.teach_submission_entries(submission_id, created_at);

ALTER TABLE public.teach_assignments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teach_assignment_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teach_submissions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teach_submission_entries  ENABLE ROW LEVEL SECURITY;


-- ════════════════════════════════════════════════════════════════
-- HELPERS (internal; only can_see_assignment is used by policies)
-- ════════════════════════════════════════════════════════════════

-- when the student joined the class (responded_at of the ACTIVE link), null = not in it
CREATE OR REPLACE FUNCTION public._teach_active_link(p_teacher uuid, p_student uuid, p_skill uuid)
RETURNS timestamptz
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT coalesce(ts.responded_at, ts.created_at)
  FROM public.teacher_students ts
  WHERE ts.teacher_id = p_teacher AND ts.student_id = p_student
    AND ts.skill_node_id = p_skill AND ts.status = 'active'
  LIMIT 1;
$$;

-- student is currently an addressee: active link + (whole class OR picked)
CREATE OR REPLACE FUNCTION public._teach_student_in_assignment(p_assignment uuid, p_student uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.teach_assignments a
    WHERE a.id = p_assignment
      AND public._teach_active_link(a.teacher_id, p_student, a.skill_node_id) IS NOT NULL
      AND (a.audience = 'group' OR EXISTS (
        SELECT 1 FROM public.teach_assignment_students s
        WHERE s.assignment_id = a.id AND s.student_id = p_student))
  );
$$;

CREATE OR REPLACE FUNCTION public.can_see_assignment(p_assignment uuid, p_uid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM public.teach_assignments a WHERE a.id = p_assignment AND a.teacher_id = p_uid)
      OR public._teach_student_in_assignment(p_assignment, p_uid);
$$;

-- creating / editing needs the skill on the approved license (same join as teacher_students_request)
CREATE OR REPLACE FUNCTION public._teach_licensed(p_teacher uuid, p_skill uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.license_skills ls
    JOIN public.teacher_licenses tl ON tl.id = ls.license_id
    WHERE tl.user_id = p_teacher AND ls.skill_node_id = p_skill AND ls.status = 'approved'
  );
$$;

CREATE OR REPLACE FUNCTION public._teach_name(p_uid uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT coalesce(nullif(trim(concat_ws(' ', first_name, last_name)), ''), username, 'Someone')
  FROM public.profiles WHERE id = p_uid;
$$;

-- Keeps at most 10 known attachment shapes, drops anything else:
--   {kind:'file', path, name, mime, size}  path must sit under p_prefix (the caller's own folder)
--   {kind:'link', url, title?}             http(s) only, never javascript: etc.
--   {kind:'material', material_id}         reserved for phase 2 (library)
CREATE OR REPLACE FUNCTION public._teach_clean_attachments(p jsonb, p_prefix text)
RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = ''
AS $$
  SELECT coalesce(jsonb_agg(item ORDER BY ord), '[]'::jsonb)
  FROM (
    SELECT ord,
      CASE e->>'kind'
        WHEN 'file' THEN jsonb_build_object(
          'kind', 'file', 'path', e->>'path',
          'name', left(coalesce(e->>'name', 'file'), 200),
          'mime', left(coalesce(e->>'mime', ''), 100),
          'size', coalesce((e->>'size')::bigint, 0))
        WHEN 'link' THEN jsonb_strip_nulls(jsonb_build_object(
          'kind', 'link', 'url', left(e->>'url', 2000), 'title', left(e->>'title', 200)))
        WHEN 'material' THEN jsonb_build_object('kind', 'material', 'material_id', e->>'material_id')
      END AS item
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p) = 'array' THEN p ELSE '[]'::jsonb END)
         WITH ORDINALITY AS t(e, ord)
    WHERE (e->>'kind' = 'file' AND e->>'path' LIKE p_prefix || '%' AND e->>'path' NOT LIKE '%..%'
                               AND coalesce(e->>'size', '0') ~ '^[0-9]{1,12}$')
       OR (e->>'kind' = 'link' AND e->>'url' ~* '^https?://[^\s]+$')
       OR (e->>'kind' = 'material' AND e->>'material_id' ~* '^[0-9a-f-]{36}$')
    ORDER BY ord
    LIMIT 10
  ) x;
$$;

CREATE OR REPLACE FUNCTION public._teach_notify(p_user uuid, p_type text, p_assignment uuid, p_other uuid, p_extra jsonb DEFAULT '{}'::jsonb)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$
  INSERT INTO public.notifications (user_id, type, data)
  SELECT p_user, p_type, jsonb_build_object(
           'assignment_id', a.id, 'title', a.title,
           'skill_node_id', a.skill_node_id, 'skill_name', sn.name,
           'other_name', public._teach_name(p_other)) || p_extra
  FROM public.teach_assignments a
  JOIN public.skill_nodes sn ON sn.id = a.skill_node_id
  WHERE a.id = p_assignment;
$$;

REVOKE EXECUTE ON FUNCTION public._teach_active_link(uuid, uuid, uuid)          FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._teach_student_in_assignment(uuid, uuid)      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._teach_licensed(uuid, uuid)                   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._teach_name(uuid)                             FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._teach_clean_attachments(jsonb, text)         FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._teach_notify(uuid, text, uuid, uuid, jsonb)  FROM PUBLIC, anon, authenticated;
-- policies call it as the querying user
REVOKE EXECUTE ON FUNCTION public.can_see_assignment(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.can_see_assignment(uuid, uuid) TO authenticated;


-- ════════════════════════════════════════════════════════════════
-- RLS: read only
-- ════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS teach_assignments_select ON public.teach_assignments;
CREATE POLICY teach_assignments_select ON public.teach_assignments
  FOR SELECT TO authenticated
  USING (public.can_see_assignment(id, (SELECT auth.uid())));

DROP POLICY IF EXISTS teach_assignment_students_select ON public.teach_assignment_students;
CREATE POLICY teach_assignment_students_select ON public.teach_assignment_students
  FOR SELECT TO authenticated
  USING (
    student_id = (SELECT auth.uid())
    OR EXISTS (SELECT 1 FROM public.teach_assignments a
               WHERE a.id = assignment_id AND a.teacher_id = (SELECT auth.uid()))
  );

-- own submission (only while still an addressee) or the assignment's teacher
DROP POLICY IF EXISTS teach_submissions_select ON public.teach_submissions;
CREATE POLICY teach_submissions_select ON public.teach_submissions
  FOR SELECT TO authenticated
  USING (
    (student_id = (SELECT auth.uid()) AND public.can_see_assignment(assignment_id, (SELECT auth.uid())))
    OR EXISTS (SELECT 1 FROM public.teach_assignments a
               WHERE a.id = assignment_id AND a.teacher_id = (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS teach_entries_select ON public.teach_submission_entries;
CREATE POLICY teach_entries_select ON public.teach_submission_entries
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.teach_submissions s WHERE s.id = submission_id));  -- RLS of submissions applies


-- ════════════════════════════════════════════════════════════════
-- NOTIFICATIONS
-- ════════════════════════════════════════════════════════════════

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'skill_approved', 'skill_rejected',
    'license_approved', 'license_rejected',
    'student_request', 'student_accepted',
    'assignment_new', 'assignment_submitted', 'assignment_reviewed', 'assignment_comment'
  ));


-- ════════════════════════════════════════════════════════════════
-- RPC: teacher writes
-- ════════════════════════════════════════════════════════════════

-- p_id: optional, so the client can upload the teacher's files under {id}/teacher/ first
DROP FUNCTION IF EXISTS public.create_assignment(uuid, text, text, timestamptz, text, uuid[], jsonb, uuid);
CREATE OR REPLACE FUNCTION public.create_assignment(
  p_skill_node_id uuid,
  p_title         text,
  p_instructions  text,
  p_due_at        timestamptz,
  p_audience      text,
  p_student_ids   uuid[],
  p_attachments   jsonb,
  p_id            uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id  uuid := coalesce(p_id, gen_random_uuid());
  v_sid uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not signed in'; END IF;
  IF NOT public._teach_licensed(v_uid, p_skill_node_id) THEN RAISE EXCEPTION 'not licensed for this skill'; END IF;
  IF p_audience NOT IN ('group', 'students') THEN RAISE EXCEPTION 'bad audience'; END IF;
  IF p_audience = 'students' THEN
    IF coalesce(array_length(p_student_ids, 1), 0) = 0 THEN RAISE EXCEPTION 'pick at least one student'; END IF;
    FOREACH v_sid IN ARRAY p_student_ids LOOP
      IF public._teach_active_link(v_uid, v_sid, p_skill_node_id) IS NULL THEN
        RAISE EXCEPTION 'not your student in this skill';
      END IF;
    END LOOP;
  END IF;

  INSERT INTO public.teach_assignments (id, teacher_id, skill_node_id, title, instructions, due_at, audience, attachments)
  VALUES (v_id, v_uid, p_skill_node_id, trim(p_title), coalesce(trim(p_instructions), ''), p_due_at, p_audience,
          public._teach_clean_attachments(p_attachments, v_id::text || '/teacher/'));

  IF p_audience = 'students' THEN
    INSERT INTO public.teach_assignment_students (assignment_id, student_id)
    SELECT v_id, unnest(p_student_ids) ON CONFLICT DO NOTHING;
  END IF;

  -- everyone who got it
  PERFORM public._teach_notify(ts.student_id, 'assignment_new', v_id, v_uid)
  FROM public.teacher_students ts
  WHERE ts.teacher_id = v_uid AND ts.skill_node_id = p_skill_node_id AND ts.status = 'active'
    AND (p_audience = 'group' OR ts.student_id = ANY (p_student_ids));

  RETURN v_id;
END;
$$;

DROP FUNCTION IF EXISTS public.update_assignment(uuid, text, text, timestamptz, text, uuid[], jsonb);
CREATE OR REPLACE FUNCTION public.update_assignment(
  p_id           uuid,
  p_title        text,
  p_instructions text,
  p_due_at       timestamptz,
  p_audience     text,
  p_student_ids  uuid[],
  p_attachments  jsonb
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  a        public.teach_assignments%ROWTYPE;
  v_before uuid[];
  v_sid    uuid;
BEGIN
  SELECT * INTO a FROM public.teach_assignments WHERE id = p_id AND teacher_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'assignment not found'; END IF;
  IF NOT public._teach_licensed(v_uid, a.skill_node_id) THEN RAISE EXCEPTION 'not licensed for this skill'; END IF;
  IF p_audience NOT IN ('group', 'students') THEN RAISE EXCEPTION 'bad audience'; END IF;
  IF p_audience = 'students' THEN
    IF coalesce(array_length(p_student_ids, 1), 0) = 0 THEN RAISE EXCEPTION 'pick at least one student'; END IF;
    FOREACH v_sid IN ARRAY p_student_ids LOOP
      IF public._teach_active_link(v_uid, v_sid, a.skill_node_id) IS NULL THEN
        RAISE EXCEPTION 'not your student in this skill';
      END IF;
    END LOOP;
  END IF;

  -- current addressees, to notify only the new ones
  SELECT coalesce(array_agg(ts.student_id), '{}') INTO v_before
  FROM public.teacher_students ts
  WHERE ts.teacher_id = v_uid AND ts.skill_node_id = a.skill_node_id AND ts.status = 'active'
    AND public._teach_student_in_assignment(p_id, ts.student_id);

  UPDATE public.teach_assignments
     SET title = trim(p_title), instructions = coalesce(trim(p_instructions), ''), due_at = p_due_at,
         audience = p_audience, updated_at = now(),
         attachments = public._teach_clean_attachments(p_attachments, p_id::text || '/teacher/')
   WHERE id = p_id;

  -- removed students keep their submissions (hidden, teacher sees them as "removed")
  DELETE FROM public.teach_assignment_students WHERE assignment_id = p_id;
  IF p_audience = 'students' THEN
    INSERT INTO public.teach_assignment_students (assignment_id, student_id)
    SELECT p_id, unnest(p_student_ids) ON CONFLICT DO NOTHING;
  END IF;

  PERFORM public._teach_notify(ts.student_id, 'assignment_new', p_id, v_uid)
  FROM public.teacher_students ts
  WHERE ts.teacher_id = v_uid AND ts.skill_node_id = a.skill_node_id AND ts.status = 'active'
    AND NOT (ts.student_id = ANY (v_before))
    AND public._teach_student_in_assignment(p_id, ts.student_id);
END;
$$;

-- Deleting is two steps on the client, in this order:
--   1. assignment_file_paths(id) → storage.remove(paths)  (the delete policy needs the row to
--      still exist to know you're its teacher; SQL can't delete storage objects itself)
--   2. delete_assignment(id)                                (cascade: submissions + thread)
CREATE OR REPLACE FUNCTION public.assignment_file_paths(p_id uuid)
RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT coalesce(array_agg(o.name), '{}')
  FROM storage.objects o
  WHERE o.bucket_id = 'teach-files' AND o.name LIKE p_id::text || '/%'
    AND EXISTS (SELECT 1 FROM public.teach_assignments WHERE id = p_id AND teacher_id = auth.uid());
$$;

DROP FUNCTION IF EXISTS public.delete_assignment(uuid);
CREATE OR REPLACE FUNCTION public.delete_assignment(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.teach_assignments WHERE id = p_id AND teacher_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'assignment not found'; END IF;
END;
$$;


-- ════════════════════════════════════════════════════════════════
-- RPC: the submission loop
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.submit_assignment(p_assignment_id uuid, p_body text, p_attachments jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_body  text := coalesce(trim(p_body), '');
  v_att   jsonb;
  s       public.teach_submissions%ROWTYPE;
  v_teach uuid;
BEGIN
  IF v_uid IS NULL OR NOT public._teach_student_in_assignment(p_assignment_id, v_uid) THEN
    RAISE EXCEPTION 'assignment not found';
  END IF;
  v_att := public._teach_clean_attachments(p_attachments, p_assignment_id::text || '/' || v_uid::text || '/');
  IF v_body = '' AND jsonb_array_length(v_att) = 0 THEN RAISE EXCEPTION 'empty submission'; END IF;

  -- make sure the row exists, then lock it: two fast clicks can't both pass the status check
  INSERT INTO public.teach_submissions (assignment_id, student_id, status)
  VALUES (p_assignment_id, v_uid, 'submitted')
  ON CONFLICT (assignment_id, student_id) DO NOTHING;
  SELECT * INTO s FROM public.teach_submissions
  WHERE assignment_id = p_assignment_id AND student_id = v_uid FOR UPDATE;

  IF s.status = 'done' THEN RAISE EXCEPTION 'already done'; END IF;
  -- a fresh row is already 'submitted' with no entries; an existing 'submitted' one is waiting for review
  IF s.status = 'submitted' AND EXISTS (
    SELECT 1 FROM public.teach_submission_entries WHERE submission_id = s.id AND kind = 'submission') THEN
    RAISE EXCEPTION 'already submitted';
  END IF;

  UPDATE public.teach_submissions
     SET status = 'submitted', submitted_at = now(), reviewed_at = NULL
   WHERE id = s.id;
  INSERT INTO public.teach_submission_entries (submission_id, author_id, kind, body, attachments)
  VALUES (s.id, v_uid, 'submission', v_body, v_att);

  SELECT teacher_id INTO v_teach FROM public.teach_assignments WHERE id = p_assignment_id;
  PERFORM public._teach_notify(v_teach, 'assignment_submitted', p_assignment_id, v_uid,
                               jsonb_build_object('student_id', v_uid));
  RETURN s.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_submission(p_submission_id uuid, p_decision text, p_comment text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_comment text := coalesce(trim(p_comment), '');
  s         public.teach_submissions%ROWTYPE;
BEGIN
  SELECT sub.* INTO s FROM public.teach_submissions sub
  JOIN public.teach_assignments a ON a.id = sub.assignment_id
  WHERE sub.id = p_submission_id AND a.teacher_id = v_uid
  FOR UPDATE OF sub;
  IF NOT FOUND THEN RAISE EXCEPTION 'submission not found'; END IF;
  IF NOT public._teach_student_in_assignment(s.assignment_id, s.student_id) THEN
    RAISE EXCEPTION 'student is no longer in this assignment';
  END IF;
  IF s.status <> 'submitted' THEN RAISE EXCEPTION 'nothing to review'; END IF;
  IF p_decision NOT IN ('done', 'returned') THEN RAISE EXCEPTION 'bad decision'; END IF;
  IF p_decision = 'returned' AND v_comment = '' THEN RAISE EXCEPTION 'say what to fix'; END IF;

  UPDATE public.teach_submissions SET status = p_decision, reviewed_at = now() WHERE id = s.id;
  INSERT INTO public.teach_submission_entries (submission_id, author_id, kind, decision, body)
  VALUES (s.id, v_uid, 'review', p_decision, v_comment);

  PERFORM public._teach_notify(s.student_id, 'assignment_reviewed', s.assignment_id, v_uid,
                               jsonb_build_object('decision', p_decision));
END;
$$;

CREATE OR REPLACE FUNCTION public.comment_submission(p_submission_id uuid, p_body text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_body text := coalesce(trim(p_body), '');
  s      public.teach_submissions%ROWTYPE;
  v_teach uuid;
BEGIN
  IF v_body = '' THEN RAISE EXCEPTION 'empty comment'; END IF;
  SELECT * INTO s FROM public.teach_submissions WHERE id = p_submission_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'submission not found'; END IF;
  SELECT teacher_id INTO v_teach FROM public.teach_assignments WHERE id = s.assignment_id;
  IF v_uid NOT IN (s.student_id, v_teach) THEN RAISE EXCEPTION 'submission not found'; END IF;
  -- a student who left / was removed: read-only for both sides, nobody gets pinged
  IF NOT public._teach_student_in_assignment(s.assignment_id, s.student_id) THEN
    RAISE EXCEPTION 'student is no longer in this assignment';
  END IF;

  INSERT INTO public.teach_submission_entries (submission_id, author_id, kind, body)
  VALUES (s.id, v_uid, 'comment', v_body);

  IF v_uid = v_teach THEN
    PERFORM public._teach_notify(s.student_id, 'assignment_comment', s.assignment_id, v_uid,
                                 jsonb_build_object('to_role', 'student'));
  ELSE
    PERFORM public._teach_notify(v_teach, 'assignment_comment', s.assignment_id, v_uid,
                                 jsonb_build_object('to_role', 'teacher', 'student_id', v_uid));
  END IF;
END;
$$;


-- ════════════════════════════════════════════════════════════════
-- RPC: reads with computed state
-- ════════════════════════════════════════════════════════════════

-- one card per class: skills with an active student, on the approved license,
-- or with assignments of yours (so old work stays reachable from notifications)
CREATE OR REPLACE FUNCTION public.teacher_classes_overview()
RETURNS TABLE (
  skill_node_id   uuid,
  skill_name      text,
  skill_image_url text,
  students        integer,
  assignments     integer,
  to_review       integer,
  next_due        timestamptz,
  licensed        boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  WITH me AS (SELECT auth.uid() AS uid),
  skills AS (
    SELECT ts.skill_node_id FROM public.teacher_students ts, me
    WHERE ts.teacher_id = me.uid AND ts.status = 'active'
    UNION
    SELECT ls.skill_node_id FROM public.license_skills ls
    JOIN public.teacher_licenses tl ON tl.id = ls.license_id, me
    WHERE tl.user_id = me.uid AND ls.status = 'approved'
    UNION
    SELECT a.skill_node_id FROM public.teach_assignments a, me
    WHERE a.teacher_id = me.uid
  )
  SELECT
    sk.skill_node_id, sn.name, sn.image_url,
    (SELECT count(*)::int FROM public.teacher_students ts
      WHERE ts.teacher_id = me.uid AND ts.skill_node_id = sk.skill_node_id AND ts.status = 'active'),
    (SELECT count(*)::int FROM public.teach_assignments a
      WHERE a.teacher_id = me.uid AND a.skill_node_id = sk.skill_node_id),
    (SELECT count(*)::int FROM public.teach_submissions s
      JOIN public.teach_assignments a ON a.id = s.assignment_id
      WHERE a.teacher_id = me.uid AND a.skill_node_id = sk.skill_node_id AND s.status = 'submitted'
        AND public._teach_student_in_assignment(a.id, s.student_id)),
    (SELECT min(a.due_at) FROM public.teach_assignments a
      WHERE a.teacher_id = me.uid AND a.skill_node_id = sk.skill_node_id AND a.due_at > now()),
    public._teach_licensed(me.uid, sk.skill_node_id)
  FROM skills sk
  CROSS JOIN me
  JOIN public.skill_nodes sn ON sn.id = sk.skill_node_id
  ORDER BY sn.name;
$$;

-- assignments of one class with counts over CURRENT addressees only
CREATE OR REPLACE FUNCTION public.class_assignments(p_skill_node_id uuid)
RETURNS TABLE (
  id          uuid,
  title       text,
  due_at      timestamptz,
  audience    text,
  created_at  timestamptz,
  recipients  integer,
  submitted   integer,
  to_review   integer,
  done        integer
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT a.id, a.title, a.due_at, a.audience, a.created_at,
    count(r.student_id)::int,
    count(s.id)::int,
    count(s.id) FILTER (WHERE s.status = 'submitted')::int,
    count(s.id) FILTER (WHERE s.status = 'done')::int
  FROM public.teach_assignments a
  LEFT JOIN LATERAL (
    SELECT ts.student_id FROM public.teacher_students ts
    WHERE ts.teacher_id = a.teacher_id AND ts.skill_node_id = a.skill_node_id AND ts.status = 'active'
      AND (a.audience = 'group' OR EXISTS (
        SELECT 1 FROM public.teach_assignment_students x WHERE x.assignment_id = a.id AND x.student_id = ts.student_id))
  ) r ON true
  LEFT JOIN public.teach_submissions s ON s.assignment_id = a.id AND s.student_id = r.student_id
  WHERE a.teacher_id = auth.uid() AND a.skill_node_id = p_skill_node_id
  GROUP BY a.id
  ORDER BY a.created_at DESC;
$$;

-- every student relevant to one assignment, with state:
--   current addressees: not_started | submitted | returned | done
--   has a submission but no longer an addressee: left (link ended) | removed (taken off the assignment)
CREATE OR REPLACE FUNCTION public.assignment_progress(p_assignment_id uuid)
RETURNS TABLE (
  student_id    uuid,
  first_name    text,
  last_name     text,
  username      text,
  avatar_url    text,
  state         text,
  submission_id uuid,
  submitted_at  timestamptz,
  late          boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  WITH a AS (
    SELECT * FROM public.teach_assignments WHERE id = p_assignment_id AND teacher_id = auth.uid()
  ),
  people AS (
    SELECT ts.student_id FROM public.teacher_students ts, a
    WHERE ts.teacher_id = a.teacher_id AND ts.skill_node_id = a.skill_node_id AND ts.status = 'active'
      AND public._teach_student_in_assignment(a.id, ts.student_id)
    UNION
    SELECT s.student_id FROM public.teach_submissions s, a WHERE s.assignment_id = a.id
  )
  SELECT p.student_id, pr.first_name, pr.last_name, pr.username, pr.avatar_url,
    CASE
      WHEN public._teach_student_in_assignment(a.id, p.student_id) THEN coalesce(s.status, 'not_started')
      WHEN public._teach_active_link(a.teacher_id, p.student_id, a.skill_node_id) IS NULL THEN 'left'
      ELSE 'removed'
    END,
    s.id, s.submitted_at,
    (a.due_at IS NOT NULL AND coalesce(s.status, '') <> 'done'
      AND a.due_at < coalesce(s.first_submitted_at, now())
      AND coalesce(public._teach_active_link(a.teacher_id, p.student_id, a.skill_node_id), '-infinity') < a.due_at)
  FROM people p
  CROSS JOIN a
  JOIN public.profiles pr ON pr.id = p.student_id
  LEFT JOIN public.teach_submissions s ON s.assignment_id = a.id AND s.student_id = p.student_id
  ORDER BY pr.first_name NULLS LAST, pr.username;
$$;

-- the caller's own assignments in one skill (any of their teachers)
CREATE OR REPLACE FUNCTION public.my_assignments(p_skill_node_id uuid)
RETURNS TABLE (
  id            uuid,
  teacher_id    uuid,
  title         text,
  due_at        timestamptz,
  created_at    timestamptz,
  state         text,
  submission_id uuid,
  late          boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT a.id, a.teacher_id, a.title, a.due_at, a.created_at,
    coalesce(s.status, 'not_started'), s.id,
    (a.due_at IS NOT NULL AND coalesce(s.status, '') <> 'done'
      AND a.due_at < coalesce(s.first_submitted_at, now())
      AND coalesce(public._teach_active_link(a.teacher_id, auth.uid(), a.skill_node_id) < a.due_at, false))
  FROM public.teach_assignments a
  LEFT JOIN public.teach_submissions s ON s.assignment_id = a.id AND s.student_id = auth.uid()
  WHERE a.skill_node_id = p_skill_node_id
    AND public._teach_student_in_assignment(a.id, auth.uid())
  ORDER BY a.due_at NULLS LAST, a.created_at DESC;
$$;

-- per active student of one class: open (not started) / returned / waiting for review
CREATE OR REPLACE FUNCTION public.class_students_summary(p_skill_node_id uuid)
RETURNS TABLE (student_id uuid, open integer, returned integer, to_review integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT ts.student_id,
    count(*) FILTER (WHERE s.id IS NULL)::int,
    count(*) FILTER (WHERE s.status = 'returned')::int,
    count(*) FILTER (WHERE s.status = 'submitted')::int
  FROM public.teacher_students ts
  JOIN public.teach_assignments a
    ON a.teacher_id = ts.teacher_id AND a.skill_node_id = ts.skill_node_id
   AND (a.audience = 'group' OR EXISTS (
     SELECT 1 FROM public.teach_assignment_students x WHERE x.assignment_id = a.id AND x.student_id = ts.student_id))
  LEFT JOIN public.teach_submissions s ON s.assignment_id = a.id AND s.student_id = ts.student_id
  WHERE ts.teacher_id = auth.uid() AND ts.skill_node_id = p_skill_node_id AND ts.status = 'active'
  GROUP BY ts.student_id;
$$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.create_assignment(uuid, text, text, timestamptz, text, uuid[], jsonb, uuid)',
    'public.update_assignment(uuid, text, text, timestamptz, text, uuid[], jsonb)',
    'public.delete_assignment(uuid)',
    'public.assignment_file_paths(uuid)',
    'public.submit_assignment(uuid, text, jsonb)',
    'public.review_submission(uuid, text, text)',
    'public.comment_submission(uuid, text)',
    'public.teacher_classes_overview()',
    'public.class_assignments(uuid)',
    'public.assignment_progress(uuid)',
    'public.my_assignments(uuid)',
    'public.class_students_summary(uuid)'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END $$;


-- ════════════════════════════════════════════════════════════════
-- STORAGE: teach-files (PRIVATE)
--   {assignment_id}/teacher/{file}      the teacher's attachments
--   {assignment_id}/{student_id}/{file} a student's submission files
-- ════════════════════════════════════════════════════════════════

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('teach-files', 'teach-files', false, 15728640,
        ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf',
              'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/ogg'])
ON CONFLICT (id) DO UPDATE SET
  public             = EXCLUDED.public,
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- first path segment → assignment id (null when it isn't a uuid, so a bad path never casts-errors)
CREATE OR REPLACE FUNCTION public._teach_path_assignment(p_name text)
RETURNS uuid
LANGUAGE sql IMMUTABLE SET search_path = ''
AS $$
  SELECT CASE WHEN split_part(p_name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              THEN split_part(p_name, '/', 1)::uuid END;
$$;

CREATE OR REPLACE FUNCTION public._teach_is_teacher_of(p_assignment uuid, p_uid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM public.teach_assignments WHERE id = p_assignment AND teacher_id = p_uid);
$$;

-- Insert of a teacher file happens BEFORE create_assignment (client-generated id),
-- so for the 'teacher' folder an assignment that doesn't exist yet is allowed too:
-- the path is then claimed by whoever creates the assignment with that id.
CREATE OR REPLACE FUNCTION public._teach_can_upload(p_name text, p_uid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT CASE
    WHEN public._teach_path_assignment(p_name) IS NULL THEN false
    WHEN split_part(p_name, '/', 2) = 'teacher' THEN
      public._teach_is_teacher_of(public._teach_path_assignment(p_name), p_uid)
      OR (NOT EXISTS (SELECT 1 FROM public.teach_assignments WHERE id = public._teach_path_assignment(p_name))
          AND EXISTS (SELECT 1 FROM public.teacher_licenses tl
                      JOIN public.license_skills ls ON ls.license_id = tl.id
                      WHERE tl.user_id = p_uid AND ls.status = 'approved'))
    WHEN split_part(p_name, '/', 2) = p_uid::text THEN
      public._teach_student_in_assignment(public._teach_path_assignment(p_name), p_uid)
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public._teach_can_read(p_name text, p_uid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT public._teach_path_assignment(p_name) IS NOT NULL AND (
    public._teach_is_teacher_of(public._teach_path_assignment(p_name), p_uid)
    -- the uploader of a not-yet-created assignment's file (preview in the form)
    OR (split_part(p_name, '/', 2) = 'teacher'
        AND NOT EXISTS (SELECT 1 FROM public.teach_assignments WHERE id = public._teach_path_assignment(p_name))
        AND EXISTS (SELECT 1 FROM storage.objects o
                    WHERE o.bucket_id = 'teach-files' AND o.name = p_name AND o.owner_id = p_uid::text))
    OR (split_part(p_name, '/', 2) IN ('teacher', p_uid::text)
        AND public._teach_student_in_assignment(public._teach_path_assignment(p_name), p_uid))
  );
$$;

REVOKE EXECUTE ON FUNCTION public._teach_path_assignment(text)       FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public._teach_is_teacher_of(uuid, uuid)   FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public._teach_can_upload(text, uuid)      FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public._teach_can_read(text, uuid)        FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public._teach_path_assignment(text)       TO authenticated;
GRANT  EXECUTE ON FUNCTION public._teach_is_teacher_of(uuid, uuid)   TO authenticated;
GRANT  EXECUTE ON FUNCTION public._teach_can_upload(text, uuid)      TO authenticated;
GRANT  EXECUTE ON FUNCTION public._teach_can_read(text, uuid)        TO authenticated;

DROP POLICY IF EXISTS "teach-files read"   ON storage.objects;
DROP POLICY IF EXISTS "teach-files insert" ON storage.objects;
DROP POLICY IF EXISTS "teach-files delete" ON storage.objects;

CREATE POLICY "teach-files read" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'teach-files' AND public._teach_can_read(name, (SELECT auth.uid()))
  );

CREATE POLICY "teach-files insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'teach-files' AND public._teach_can_upload(name, (SELECT auth.uid()))
  );

-- only the teacher, for the whole assignment folder (thread files stay intact for students);
-- plus the uploader of a teacher file whose assignment was never created (cancelled form)
CREATE POLICY "teach-files delete" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'teach-files' AND (
      public._teach_is_teacher_of(public._teach_path_assignment(name), (SELECT auth.uid()))
      OR (owner_id = (SELECT auth.uid())::text
          AND split_part(name, '/', 2) = 'teacher'
          AND NOT EXISTS (SELECT 1 FROM public.teach_assignments WHERE id = public._teach_path_assignment(name)))
    )
  );
