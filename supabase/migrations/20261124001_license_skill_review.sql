-- ════════════════════════════════════════════════════════════════
-- License review per skill
--
-- The admin can leave single skills out when approving a license:
--   license_skills.status  'approved' → on the card, students can ask for it
--                          'rejected' → only the teacher sees it (with the reason),
--                                       fixed through a normal edit submission
-- Proofs of an APPROVED skill are the teacher's to manage, no review:
--   license_evidence_add() / license_evidence_remove() / license_evidence_set_public()
-- license_evidence.is_public: the teacher wants the proof on their teacher
-- profile (private by default). The profile itself reads it later.
-- approve_license_submission() now merges instead of replacing, so proofs the
-- teacher changed on approved skills survive a later edit approval.
-- ════════════════════════════════════════════════════════════════


-- ── per-skill status ────────────────────────────────────────────

ALTER TABLE public.license_skills
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'approved'
    CHECK (status IN ('approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS rejection_reason text
    CHECK (char_length(rejection_reason) <= 500);

-- proof shown on the teacher profile or not (off by default)
ALTER TABLE public.license_evidence
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;

-- "who teaches this skill": only approved ones are looked up
DROP INDEX IF EXISTS public.idx_license_skills_skill;
CREATE INDEX IF NOT EXISTS idx_license_skills_skill
  ON public.license_skills(skill_node_id) WHERE status = 'approved';


-- ── RLS: rejected skills are private to the teacher ─────────────

DROP POLICY IF EXISTS license_skills_read ON public.license_skills;
CREATE POLICY license_skills_read ON public.license_skills
  FOR SELECT TO authenticated
  USING (
    status = 'approved'
    OR EXISTS (
      SELECT 1 FROM public.teacher_licenses tl
      WHERE tl.id = license_skills.license_id AND tl.user_id = (SELECT auth.uid())
    )
  );

-- students can only ask for an approved skill
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
        AND ls.status = 'approved'
    )
  );


-- ── approve with per-skill decisions ────────────────────────────
-- p_rejected = [{ "skillNodeId": "<uuid>", "reason": "…" }, …]
-- Skills of the submission that are not listed are approved.
--   approved before + approved now → level / order updated, proofs kept (teacher manages them)
--   anything else                  → proofs replaced by the submitted ones
--   skills no longer in the submission are removed

DROP FUNCTION IF EXISTS public.approve_license_submission(uuid, uuid);

CREATE OR REPLACE FUNCTION public.approve_license_submission(
  p_submission_id uuid,
  p_actor_user_id uuid,
  p_rejected      jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  s             public.teacher_license_submissions%ROWTYPE;
  p             jsonb;
  v_ver         jsonb;
  v_license_id  uuid;
  v_ls_id       uuid;
  v_skill       jsonb;
  v_skill_id    uuid;
  v_ev          jsonb;
  v_prev_status text;
  v_reason      text;
  v_status      text;
  v_rejected_names text[] := '{}';
  i             integer := 0;
  j             integer;
BEGIN
  SELECT * INTO s FROM public.teacher_license_submissions WHERE id = p_submission_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'submission_not_found'; END IF;
  IF s.status <> 'pending' THEN RAISE EXCEPTION 'submission_not_pending'; END IF;

  p := s.payload;
  IF jsonb_typeof(p->'skills') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'skills') = 0 THEN
    RAISE EXCEPTION 'invalid_payload_no_skills';
  END IF;
  IF jsonb_typeof(coalesce(p_rejected, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'invalid_rejected_list';
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

  -- skills the teacher took off the license (evidence cascades)
  DELETE FROM public.license_skills
   WHERE license_id = v_license_id
     AND skill_node_id NOT IN (
       SELECT (x->>'skillNodeId')::uuid FROM jsonb_array_elements(p->'skills') x
     );

  FOR v_skill IN SELECT * FROM jsonb_array_elements(p->'skills') LOOP
    v_skill_id := (v_skill->>'skillNodeId')::uuid;

    SELECT status INTO v_prev_status
      FROM public.license_skills
     WHERE license_id = v_license_id AND skill_node_id = v_skill_id;

    SELECT nullif(btrim(coalesce(r->>'reason', '')), '') INTO v_reason
      FROM jsonb_array_elements(coalesce(p_rejected, '[]'::jsonb)) r
     WHERE (r->>'skillNodeId')::uuid = v_skill_id
     LIMIT 1;
    v_status := CASE WHEN FOUND THEN 'rejected' ELSE 'approved' END;
    IF v_status = 'rejected' THEN
      v_rejected_names := v_rejected_names || coalesce(v_skill->>'skillName', 'Skill');
    END IF;

    INSERT INTO public.license_skills AS ls (license_id, skill_node_id, level, sort_order, status, rejection_reason)
    VALUES (v_license_id, v_skill_id, v_skill->>'level', i, v_status,
            CASE WHEN v_status = 'rejected' THEN left(v_reason, 500) END)
    ON CONFLICT (license_id, skill_node_id) DO UPDATE SET
      level            = EXCLUDED.level,
      sort_order       = EXCLUDED.sort_order,
      status           = EXCLUDED.status,
      rejection_reason = EXCLUDED.rejection_reason
    RETURNING ls.id INTO v_ls_id;
    i := i + 1;

    -- approved before and still approved: keep the proofs the teacher manages
    IF v_prev_status = 'approved' AND v_status = 'approved' THEN
      CONTINUE;
    END IF;

    DELETE FROM public.license_evidence WHERE license_skill_id = v_ls_id;
    j := 0;
    FOR v_ev IN SELECT * FROM jsonb_array_elements(coalesce(v_skill->'evidence', '[]'::jsonb)) LOOP
      INSERT INTO public.license_evidence
        (license_skill_id, kind, type, url, storage_path, file_name, description, date, sort_order, is_public)
      VALUES (
        v_ls_id,
        v_ev->>'kind',
        v_ev->>'type',
        CASE WHEN v_ev->>'kind' = 'link' THEN v_ev->>'url' END,
        CASE WHEN v_ev->>'kind' <> 'link' THEN v_ev->>'path' END,
        v_ev->>'fileName',
        coalesce(v_ev->>'description', ''),
        nullif(v_ev->>'date', '')::date,
        j,
        coalesce((v_ev->>'isPublic')::boolean, false)
      );
      j := j + 1;
    END LOOP;
  END LOOP;

  -- a license needs at least one skill on the card; otherwise reject it instead
  IF NOT EXISTS (
    SELECT 1 FROM public.license_skills WHERE license_id = v_license_id AND status = 'approved'
  ) THEN
    RAISE EXCEPTION 'no_approved_skills';
  END IF;

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
          jsonb_build_object('status', 'approved', 'license_id', v_license_id,
                             'rejected_skills', coalesce(p_rejected, '[]'::jsonb)));

  INSERT INTO public.notifications (user_id, type, data)
  VALUES (s.user_id, 'license_approved',
          jsonb_build_object('kind', s.kind, 'rejected_skills', to_jsonb(v_rejected_names)));

  RETURN v_license_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.approve_license_submission(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_license_submission(uuid, uuid, jsonb) TO service_role;


-- ── proofs of an approved skill: managed by the teacher ─────────
-- Writes only through these functions (license_evidence has no write policies).

CREATE OR REPLACE FUNCTION public.license_evidence_add(
  p_license_skill_id uuid,
  p_kind        text,
  p_type        text,
  p_url         text,
  p_path        text,
  p_file_name   text,
  p_description text,
  p_date        date,
  p_is_public   boolean DEFAULT false
)
RETURNS public.license_evidence
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_row public.license_evidence;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  PERFORM 1
    FROM public.license_skills ls
    JOIN public.teacher_licenses tl ON tl.id = ls.license_id
   WHERE ls.id = p_license_skill_id AND tl.user_id = v_uid AND ls.status = 'approved'
   FOR UPDATE OF ls;
  IF NOT FOUND THEN RAISE EXCEPTION 'skill_not_editable'; END IF;

  IF p_kind = 'link' THEN
    IF p_url IS NULL OR p_url !~* '^https?://' THEN RAISE EXCEPTION 'invalid_link'; END IF;
  ELSIF p_kind IN ('image', 'video', 'pdf') THEN
    -- the file must be in the teacher's own folder of the private bucket
    IF p_path IS NULL OR split_part(p_path, '/', 1) <> v_uid::text THEN RAISE EXCEPTION 'invalid_file_path'; END IF;
  ELSE
    RAISE EXCEPTION 'invalid_kind';
  END IF;

  INSERT INTO public.license_evidence
    (license_skill_id, kind, type, url, storage_path, file_name, description, date, sort_order, is_public)
  VALUES (
    p_license_skill_id,
    p_kind,
    p_type,
    CASE WHEN p_kind = 'link' THEN p_url END,
    CASE WHEN p_kind <> 'link' THEN p_path END,
    CASE WHEN p_kind <> 'link' THEN left(p_file_name, 255) END,
    left(coalesce(btrim(p_description), ''), 140),
    p_date,
    coalesce((SELECT max(sort_order) + 1 FROM public.license_evidence WHERE license_skill_id = p_license_skill_id), 0),
    coalesce(p_is_public, false)
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.license_evidence_remove(p_evidence_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid      uuid := (SELECT auth.uid());
  v_skill_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT ls.id INTO v_skill_id
    FROM public.license_evidence e
    JOIN public.license_skills ls ON ls.id = e.license_skill_id
    JOIN public.teacher_licenses tl ON tl.id = ls.license_id
   WHERE e.id = p_evidence_id AND tl.user_id = v_uid AND ls.status = 'approved'
   FOR UPDATE OF ls;
  IF NOT FOUND THEN RAISE EXCEPTION 'skill_not_editable'; END IF;

  -- an approved skill keeps at least one proof
  IF (SELECT count(*) FROM public.license_evidence WHERE license_skill_id = v_skill_id) <= 1 THEN
    RAISE EXCEPTION 'last_proof';
  END IF;

  DELETE FROM public.license_evidence WHERE id = p_evidence_id;
END;
$$;

-- public / private on the teacher profile
CREATE OR REPLACE FUNCTION public.license_evidence_set_public(p_evidence_id uuid, p_public boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  UPDATE public.license_evidence e
     SET is_public = coalesce(p_public, false)
    FROM public.license_skills ls
    JOIN public.teacher_licenses tl ON tl.id = ls.license_id
   WHERE e.id = p_evidence_id
     AND ls.id = e.license_skill_id
     AND tl.user_id = v_uid
     AND ls.status = 'approved';
  IF NOT FOUND THEN RAISE EXCEPTION 'skill_not_editable'; END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.license_evidence_add(uuid, text, text, text, text, text, text, date, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.license_evidence_remove(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.license_evidence_set_public(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.license_evidence_add(uuid, text, text, text, text, text, text, date, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.license_evidence_remove(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.license_evidence_set_public(uuid, boolean) TO authenticated;
