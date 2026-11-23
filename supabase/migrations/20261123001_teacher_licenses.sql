-- ════════════════════════════════════════════════════════════════
-- Teacher licenses + review in admin + teacher ↔ student links
--
--   teacher_license_submissions  what the teacher edits (draft → pending → approved / rejected)
--                                kind 'new' = first license, 'edit' = change of an approved one
--   teacher_licenses             the APPROVED license everyone sees (one per user)
--     license_skills             skills on it
--       license_evidence         proofs per skill
--     educator_verifications     private details of the "verified educator / student" check
--   teacher_students             student asks a teacher, teacher accepts / declines
--
-- Live tables are written only by approve_license_submission() (service role,
-- called from admin-api). While an edit waits for review, the old approved
-- version stays visible.
-- ════════════════════════════════════════════════════════════════


-- ── live (approved) license ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.teacher_licenses (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  title_before        text NOT NULL DEFAULT '' CHECK (char_length(title_before) <= 30),
  title_after         text NOT NULL DEFAULT '' CHECK (char_length(title_after) <= 30),
  role                text CHECK (role IN ('teacher', 'coach', 'lecturer', 'professional', 'self_taught', 'student')),
  country_code        text NOT NULL DEFAULT 'CZ' CHECK (country_code ~ '^[A-Z]{2}$'),
  institution_type    text CHECK (institution_type IN ('university', 'school', 'organization', 'club', 'other')),
  institution_id      text,
  institution_name    text NOT NULL DEFAULT '' CHECK (char_length(institution_name) <= 200),
  institution_domains text[],
  bio                 text NOT NULL DEFAULT '' CHECK (char_length(bio) <= 200),
  photo_path          text,  -- bucket license-photos (public)
  theme               text NOT NULL DEFAULT 'violet' CHECK (theme IN ('violet', 'indigo', 'fuchsia', 'midnight')),
  -- public summary of the verification (details are private, see educator_verifications)
  verification_kind   text CHECK (verification_kind IN ('educator', 'student')),
  verification_status text NOT NULL DEFAULT 'none' CHECK (verification_status IN ('none', 'pending', 'verified')),
  approved_at         timestamptz NOT NULL DEFAULT now(),
  approved_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.license_skills (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id    uuid NOT NULL REFERENCES public.teacher_licenses(id) ON DELETE CASCADE,
  skill_node_id uuid NOT NULL REFERENCES public.skill_nodes(id) ON DELETE CASCADE,
  level         text NOT NULL CHECK (level IN ('intermediate', 'advanced', 'expert')),
  sort_order    integer NOT NULL DEFAULT 0,
  UNIQUE (license_id, skill_node_id)
);
-- "who teaches this skill" (TeachersWidget)
CREATE INDEX IF NOT EXISTS idx_license_skills_skill ON public.license_skills(skill_node_id);

CREATE TABLE IF NOT EXISTS public.license_evidence (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  license_skill_id uuid NOT NULL REFERENCES public.license_skills(id) ON DELETE CASCADE,
  kind             text NOT NULL CHECK (kind IN ('image', 'video', 'pdf', 'link')),
  type             text NOT NULL CHECK (type IN ('certificate', 'competition', 'home_showcase')),
  url              text,  -- links only
  storage_path     text,  -- files only, bucket license-files (private)
  file_name        text,
  description      text NOT NULL DEFAULT '' CHECK (char_length(description) <= 140),
  date             date,
  sort_order       integer NOT NULL DEFAULT 0,
  CHECK ((kind = 'link') = (url IS NOT NULL)),
  CHECK ((kind = 'link') = (storage_path IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_license_evidence_skill ON public.license_evidence(license_skill_id);

CREATE TABLE IF NOT EXISTS public.educator_verifications (
  license_id         uuid PRIMARY KEY REFERENCES public.teacher_licenses(id) ON DELETE CASCADE,
  kind               text NOT NULL CHECK (kind IN ('educator', 'student')),
  method             text NOT NULL CHECK (method IN ('email', 'document')),
  status             text NOT NULL CHECK (status IN ('pending', 'verified')),
  email              text,
  document_path      text,  -- bucket license-files (private)
  document_file_name text,
  submitted_at       timestamptz,
  verified_at        timestamptz
);

DROP TRIGGER IF EXISTS trg_teacher_licenses_updated_at ON public.teacher_licenses;
CREATE TRIGGER trg_teacher_licenses_updated_at
  BEFORE UPDATE ON public.teacher_licenses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ── submissions (drafts + review queue) ─────────────────────────

CREATE TABLE IF NOT EXISTS public.teacher_license_submissions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind             text NOT NULL DEFAULT 'new' CHECK (kind IN ('new', 'edit')),
  status           text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'approved', 'rejected')),
  -- full snapshot of the form, camelCase like the TS type LicensePayload
  payload          jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object' AND octet_length(payload::text) <= 200000),
  submitted_at     timestamptz,
  reviewed_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at      timestamptz,
  rejection_reason text CHECK (char_length(rejection_reason) <= 1000),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- at most one open (draft / pending) submission per user
CREATE UNIQUE INDEX IF NOT EXISTS uq_license_submissions_open
  ON public.teacher_license_submissions(user_id)
  WHERE status IN ('draft', 'pending');
-- admin queue: pending, split by kind, oldest first
CREATE INDEX IF NOT EXISTS idx_license_submissions_queue
  ON public.teacher_license_submissions(kind, submitted_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_license_submissions_user
  ON public.teacher_license_submissions(user_id, created_at DESC);

-- kind and submitted_at are decided here, not by the client
CREATE OR REPLACE FUNCTION public.tg_license_submission_fill()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.status IN ('draft', 'pending') THEN
    NEW.kind := CASE
      WHEN EXISTS (SELECT 1 FROM public.teacher_licenses WHERE user_id = NEW.user_id) THEN 'edit'
      ELSE 'new'
    END;
    IF NEW.status = 'pending' AND (TG_OP = 'INSERT' OR OLD.status <> 'pending') THEN
      NEW.submitted_at := now();
    ELSIF NEW.status = 'draft' THEN
      NEW.submitted_at := NULL;
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_license_submission_fill ON public.teacher_license_submissions;
CREATE TRIGGER trg_license_submission_fill
  BEFORE INSERT OR UPDATE ON public.teacher_license_submissions
  FOR EACH ROW EXECUTE FUNCTION public.tg_license_submission_fill();


-- ── teacher ↔ student ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.teacher_students (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  student_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  skill_node_id uuid NOT NULL REFERENCES public.skill_nodes(id) ON DELETE CASCADE,
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'active', 'declined', 'cancelled', 'ended')),
  message       text CHECK (char_length(message) <= 300),
  created_at    timestamptz NOT NULL DEFAULT now(),
  responded_at  timestamptz,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (teacher_id <> student_id)
);

-- one open link per teacher + student + skill
CREATE UNIQUE INDEX IF NOT EXISTS uq_teacher_students_open
  ON public.teacher_students(teacher_id, student_id, skill_node_id)
  WHERE status IN ('pending', 'active');
CREATE INDEX IF NOT EXISTS idx_teacher_students_teacher ON public.teacher_students(teacher_id, status);
CREATE INDEX IF NOT EXISTS idx_teacher_students_student ON public.teacher_students(student_id, status);
CREATE INDEX IF NOT EXISTS idx_teacher_students_skill ON public.teacher_students(skill_node_id);

-- Allowed status moves. Everything else on the row is immutable for clients.
--   teacher: pending → active | declined,  active → ended
--   student: pending → cancelled,          active → ended
CREATE OR REPLACE FUNCTION public.tg_teacher_students_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
BEGIN
  IF v_uid IS NOT NULL THEN  -- service role (admin) may do anything
    IF NEW.teacher_id <> OLD.teacher_id OR NEW.student_id <> OLD.student_id
       OR NEW.skill_node_id <> OLD.skill_node_id OR NEW.message IS DISTINCT FROM OLD.message
       OR NEW.created_at <> OLD.created_at THEN
      RAISE EXCEPTION 'immutable_field';
    END IF;
    IF NEW.status <> OLD.status AND NOT (
         (v_uid = OLD.teacher_id AND OLD.status = 'pending' AND NEW.status IN ('active', 'declined'))
      OR (v_uid = OLD.teacher_id AND OLD.status = 'active'  AND NEW.status = 'ended')
      OR (v_uid = OLD.student_id AND OLD.status = 'pending' AND NEW.status = 'cancelled')
      OR (v_uid = OLD.student_id AND OLD.status = 'active'  AND NEW.status = 'ended')
    ) THEN
      RAISE EXCEPTION 'invalid_status_change';
    END IF;
  END IF;
  IF NEW.status <> OLD.status AND OLD.status = 'pending' THEN
    NEW.responded_at := now();
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_teacher_students_guard ON public.teacher_students;
CREATE TRIGGER trg_teacher_students_guard
  BEFORE UPDATE ON public.teacher_students
  FOR EACH ROW EXECUTE FUNCTION public.tg_teacher_students_guard();


-- ── notifications ───────────────────────────────────────────────

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'skill_approved', 'skill_rejected',
    'license_approved', 'license_rejected',
    'student_request', 'student_accepted'
  ));

-- Users can't insert notifications, so this trigger runs as owner.
-- Trigger functions can't be called through the API, only fired by the table.
CREATE OR REPLACE FUNCTION public.tg_teacher_students_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_skill   text;
  v_student text;
  v_teacher text;
BEGIN
  SELECT name INTO v_skill FROM public.skill_nodes WHERE id = NEW.skill_node_id;

  IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
    SELECT coalesce(nullif(trim(concat_ws(' ', first_name, last_name)), ''), username, 'Someone')
      INTO v_student FROM public.profiles WHERE id = NEW.student_id;
    INSERT INTO public.notifications (user_id, type, data)
    VALUES (NEW.teacher_id, 'student_request',
            jsonb_build_object('request_id', NEW.id, 'student_name', v_student, 'skill_name', v_skill));

  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'pending' AND NEW.status = 'active' THEN
    SELECT coalesce(nullif(trim(concat_ws(' ', first_name, last_name)), ''), username, 'Your teacher')
      INTO v_teacher FROM public.profiles WHERE id = NEW.teacher_id;
    INSERT INTO public.notifications (user_id, type, data)
    VALUES (NEW.student_id, 'student_accepted',
            jsonb_build_object('teacher_id', NEW.teacher_id, 'teacher_name', v_teacher, 'skill_name', v_skill));
  END IF;
  RETURN NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.tg_teacher_students_notify() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_teacher_students_notify ON public.teacher_students;
CREATE TRIGGER trg_teacher_students_notify
  AFTER INSERT OR UPDATE OF status ON public.teacher_students
  FOR EACH ROW EXECUTE FUNCTION public.tg_teacher_students_notify();


-- ── RLS ─────────────────────────────────────────────────────────

ALTER TABLE public.teacher_licenses            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.license_skills              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.license_evidence            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.educator_verifications      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_license_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_students            ENABLE ROW LEVEL SECURITY;

-- Approved licenses and their skills are public to signed-in users (teacher cards).
-- No write policies: only approve_license_submission() writes them.
DROP POLICY IF EXISTS teacher_licenses_read ON public.teacher_licenses;
CREATE POLICY teacher_licenses_read ON public.teacher_licenses
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS license_skills_read ON public.license_skills;
CREATE POLICY license_skills_read ON public.license_skills
  FOR SELECT TO authenticated USING (true);

-- Proofs and verification details: owner only (admin reads via service role).
DROP POLICY IF EXISTS license_evidence_read_own ON public.license_evidence;
CREATE POLICY license_evidence_read_own ON public.license_evidence
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.license_skills ls
    JOIN public.teacher_licenses tl ON tl.id = ls.license_id
    WHERE ls.id = license_evidence.license_skill_id AND tl.user_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS educator_verifications_read_own ON public.educator_verifications;
CREATE POLICY educator_verifications_read_own ON public.educator_verifications
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.teacher_licenses tl
    WHERE tl.id = educator_verifications.license_id AND tl.user_id = (SELECT auth.uid())
  ));

-- Submissions: the owner may create / change / withdraw only open ones and
-- never touch the review fields (approve / reject run as service role).
DROP POLICY IF EXISTS license_submissions_select_own ON public.teacher_license_submissions;
CREATE POLICY license_submissions_select_own ON public.teacher_license_submissions
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS license_submissions_insert_own ON public.teacher_license_submissions;
CREATE POLICY license_submissions_insert_own ON public.teacher_license_submissions
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND status IN ('draft', 'pending')
    AND reviewed_by IS NULL AND reviewed_at IS NULL AND rejection_reason IS NULL
  );

DROP POLICY IF EXISTS license_submissions_update_own ON public.teacher_license_submissions;
CREATE POLICY license_submissions_update_own ON public.teacher_license_submissions
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()) AND status IN ('draft', 'pending'))
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND status IN ('draft', 'pending')
    AND reviewed_by IS NULL AND reviewed_at IS NULL AND rejection_reason IS NULL
  );

DROP POLICY IF EXISTS license_submissions_delete_own ON public.teacher_license_submissions;
CREATE POLICY license_submissions_delete_own ON public.teacher_license_submissions
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()) AND status IN ('draft', 'pending'));

-- Teacher ↔ student: both sides see the link. Only the student creates it, and
-- only for a skill on the teacher's approved license. Status moves: see guard trigger.
DROP POLICY IF EXISTS teacher_students_select ON public.teacher_students;
CREATE POLICY teacher_students_select ON public.teacher_students
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) IN (teacher_id, student_id));

DROP POLICY IF EXISTS teacher_students_request ON public.teacher_students;
CREATE POLICY teacher_students_request ON public.teacher_students
  FOR INSERT TO authenticated
  WITH CHECK (
    student_id = (SELECT auth.uid())
    AND status = 'pending'
    AND responded_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.license_skills ls
      JOIN public.teacher_licenses tl ON tl.id = ls.license_id
      WHERE tl.user_id = teacher_students.teacher_id
        AND ls.skill_node_id = teacher_students.skill_node_id
    )
  );

DROP POLICY IF EXISTS teacher_students_update ON public.teacher_students;
CREATE POLICY teacher_students_update ON public.teacher_students
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) IN (teacher_id, student_id))
  WITH CHECK ((SELECT auth.uid()) IN (teacher_id, student_id));


-- ── approve (service role only, called from admin-api) ──────────

CREATE OR REPLACE FUNCTION public.approve_license_submission(p_submission_id uuid, p_actor_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  s            public.teacher_license_submissions%ROWTYPE;
  p            jsonb;
  v_ver        jsonb;
  v_license_id uuid;
  v_ls_id      uuid;
  v_skill      jsonb;
  v_ev         jsonb;
  i            integer := 0;
  j            integer;
BEGIN
  SELECT * INTO s FROM public.teacher_license_submissions WHERE id = p_submission_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'submission_not_found'; END IF;
  IF s.status <> 'pending' THEN RAISE EXCEPTION 'submission_not_pending'; END IF;

  p := s.payload;
  IF jsonb_typeof(p->'skills') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'skills') = 0 THEN
    RAISE EXCEPTION 'invalid_payload_no_skills';
  END IF;
  v_ver := coalesce(p->'verification', '{}'::jsonb);

  INSERT INTO public.teacher_licenses AS tl (
    user_id, title_before, title_after, role, country_code, institution_type, institution_id,
    institution_name, institution_domains, bio, photo_path, theme,
    verification_kind, verification_status, approved_at, approved_by
  ) VALUES (
    s.user_id,
    coalesce(p->>'titleBefore', ''),
    coalesce(p->>'titleAfter', ''),
    p->>'role',
    coalesce(p->>'countryCode', 'CZ'),
    p->>'institutionType',
    p->>'institutionId',
    coalesce(p->>'institutionName', ''),
    CASE WHEN jsonb_typeof(p->'institutionDomains') = 'array'
         THEN ARRAY(SELECT jsonb_array_elements_text(p->'institutionDomains')) END,
    coalesce(p->>'bio', ''),
    p->>'photoPath',
    coalesce(p->>'theme', 'violet'),
    CASE WHEN coalesce(v_ver->>'status', 'none') <> 'none' THEN v_ver->>'kind' END,
    coalesce(v_ver->>'status', 'none'),
    now(),
    p_actor_user_id
  )
  ON CONFLICT (user_id) DO UPDATE SET
    title_before        = EXCLUDED.title_before,
    title_after         = EXCLUDED.title_after,
    role                = EXCLUDED.role,
    country_code        = EXCLUDED.country_code,
    institution_type    = EXCLUDED.institution_type,
    institution_id      = EXCLUDED.institution_id,
    institution_name    = EXCLUDED.institution_name,
    institution_domains = EXCLUDED.institution_domains,
    bio                 = EXCLUDED.bio,
    photo_path          = EXCLUDED.photo_path,
    theme               = EXCLUDED.theme,
    verification_kind   = EXCLUDED.verification_kind,
    verification_status = EXCLUDED.verification_status,
    approved_at         = EXCLUDED.approved_at,
    approved_by         = EXCLUDED.approved_by
  RETURNING tl.id INTO v_license_id;

  -- replace skills (evidence cascades)
  DELETE FROM public.license_skills WHERE license_id = v_license_id;
  FOR v_skill IN SELECT * FROM jsonb_array_elements(p->'skills') LOOP
    INSERT INTO public.license_skills (license_id, skill_node_id, level, sort_order)
    VALUES (v_license_id, (v_skill->>'skillNodeId')::uuid, v_skill->>'level', i)
    RETURNING id INTO v_ls_id;
    i := i + 1;
    j := 0;
    FOR v_ev IN SELECT * FROM jsonb_array_elements(coalesce(v_skill->'evidence', '[]'::jsonb)) LOOP
      INSERT INTO public.license_evidence
        (license_skill_id, kind, type, url, storage_path, file_name, description, date, sort_order)
      VALUES (
        v_ls_id,
        v_ev->>'kind',
        v_ev->>'type',
        CASE WHEN v_ev->>'kind' = 'link' THEN v_ev->>'url' END,
        CASE WHEN v_ev->>'kind' <> 'link' THEN v_ev->>'path' END,
        v_ev->>'fileName',
        coalesce(v_ev->>'description', ''),
        nullif(v_ev->>'date', '')::date,
        j
      );
      j := j + 1;
    END LOOP;
  END LOOP;

  DELETE FROM public.educator_verifications WHERE license_id = v_license_id;
  IF coalesce(v_ver->>'status', 'none') <> 'none' THEN
    INSERT INTO public.educator_verifications
      (license_id, kind, method, status, email, document_path, document_file_name, submitted_at, verified_at)
    VALUES (
      v_license_id,
      coalesce(v_ver->>'kind', 'educator'),
      v_ver->>'method',
      v_ver->>'status',
      v_ver->>'email',
      v_ver->>'documentPath',
      v_ver->>'documentFileName',
      nullif(v_ver->>'submittedAt', '')::timestamptz,
      nullif(v_ver->>'verifiedAt', '')::timestamptz
    );
  END IF;

  UPDATE public.teacher_license_submissions
     SET status = 'approved', reviewed_by = p_actor_user_id, reviewed_at = now()
   WHERE id = s.id;

  INSERT INTO public.admin_audit_log (actor_user_id, action, entity_type, entity_id, before_data, after_data)
  VALUES (p_actor_user_id, 'approve_license_submission', 'teacher_license_submission', s.id,
          jsonb_build_object('status', 'pending', 'kind', s.kind),
          jsonb_build_object('status', 'approved', 'license_id', v_license_id));

  INSERT INTO public.notifications (user_id, type, data)
  VALUES (s.user_id, 'license_approved', jsonb_build_object('kind', s.kind));

  RETURN v_license_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.approve_license_submission(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_license_submission(uuid, uuid) TO service_role;


-- ── teacher dashboard: my students with progress ────────────────
-- SECURITY DEFINER because a teacher can't read other users' progress /
-- activity through RLS. Returns only links where the caller is the teacher;
-- progress only for accepted (active) students.

CREATE OR REPLACE FUNCTION public.teacher_students_overview()
RETURNS TABLE (
  link_id        uuid,
  status         text,
  student_id     uuid,
  first_name     text,
  last_name      text,
  username       text,
  avatar_url     text,
  skill_node_id  uuid,
  skill_name     text,
  message        text,
  requested_at   timestamptz,
  level_name     text,
  level_index    integer,
  levels_total   integer,
  items_done     integer,
  items_total    integer,
  minutes_7d     integer,
  last_active_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    ts.id, ts.status, ts.student_id,
    p.first_name, p.last_name, p.username, p.avatar_url,
    ts.skill_node_id, sn.name, ts.message, ts.created_at,
    lvl.name,
    lvl.idx,
    (SELECT count(*)::int FROM public.skill_levels l WHERE l.skill_node_id = ts.skill_node_id),
    CASE WHEN ts.status = 'active' THEN (
      SELECT count(*)::int FROM public.user_progress_checks c
      JOIN public.skill_progress_items it ON it.id = c.item_id
      WHERE c.user_id = ts.student_id AND it.skill_node_id = ts.skill_node_id) END,
    (SELECT count(*)::int FROM public.skill_progress_items it WHERE it.skill_node_id = ts.skill_node_id),
    CASE WHEN ts.status = 'active' THEN (
      SELECT coalesce(sum(t.seconds), 0)::int / 60 FROM public.user_skill_daily_time t
      WHERE t.user_id = ts.student_id AND t.skill_node_id = ts.skill_node_id
        AND t.day >= current_date - 6) END,
    CASE WHEN ts.status = 'active' THEN (
      SELECT max(a.updated_at) FROM public.user_daily_activity a
      WHERE a.user_id = ts.student_id AND a.day >= current_date - 1) END
  FROM public.teacher_students ts
  JOIN public.profiles p     ON p.id = ts.student_id
  JOIN public.skill_nodes sn ON sn.id = ts.skill_node_id
  LEFT JOIN LATERAL (
    SELECT sl.name,
           (SELECT count(*)::int FROM public.skill_levels l2
             WHERE l2.skill_node_id = ts.skill_node_id AND l2.sort_order <= sl.sort_order) AS idx
    FROM public.user_skill_level usl
    JOIN public.skill_levels sl ON sl.id = usl.level_id
    WHERE ts.status = 'active' AND usl.user_id = ts.student_id AND usl.skill_node_id = ts.skill_node_id
  ) lvl ON true
  WHERE ts.teacher_id = (SELECT auth.uid())
    AND ts.status IN ('pending', 'active')
  ORDER BY ts.status DESC, ts.created_at DESC;  -- pending first
$$;
REVOKE EXECUTE ON FUNCTION public.teacher_students_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.teacher_students_overview() TO authenticated;


-- ── storage ─────────────────────────────────────────────────────
-- license-photos: public (shown on the card to everyone)
-- license-files:  private (proofs + verification documents; admin uses signed URLs)
-- Path: <user_id>/<file>. Owner-only writes. Upsert needs INSERT + SELECT + UPDATE.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('license-photos', 'license-photos', true, 5242880,
   ARRAY['image/jpeg', 'image/png', 'image/webp']),
  ('license-files', 'license-files', false, 26214400,
   ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf',
         'video/mp4', 'video/webm', 'video/quicktime'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "license files: owner select" ON storage.objects;
CREATE POLICY "license files: owner select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id IN ('license-photos', 'license-files')
         AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

DROP POLICY IF EXISTS "license files: owner insert" ON storage.objects;
CREATE POLICY "license files: owner insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id IN ('license-photos', 'license-files')
              AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

DROP POLICY IF EXISTS "license files: owner update" ON storage.objects;
CREATE POLICY "license files: owner update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id IN ('license-photos', 'license-files')
         AND (storage.foldername(name))[1] = (SELECT auth.uid())::text)
  WITH CHECK (bucket_id IN ('license-photos', 'license-files')
              AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

DROP POLICY IF EXISTS "license files: owner delete" ON storage.objects;
CREATE POLICY "license files: owner delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id IN ('license-photos', 'license-files')
         AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
