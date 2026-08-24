BEGIN;

-- /api/admin/audit returned a hard .limit(200) and the page filtered those 200
-- rows in the browser. Two problems, both worse since migration 010 started
-- writing a row per override change and per role deletion:
--
--   * history beyond the newest 200 entries was unreachable, with nothing in the
--     UI saying so
--   * the filter searched only what had been loaded, so it reported "no entries
--     found" for records that existed slightly further back — the worst failure
--     mode for an audit tool, since it looks like proof of absence
--
-- Do both in SQL. Casting resource_id to text here also sidesteps PostgREST's
-- inability to cast in filters, and works whether the column is uuid or text.
CREATE OR REPLACE FUNCTION public.search_audit_logs(
  p_query text DEFAULT NULL,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  id text,
  action text,
  resource_type text,
  resource_id text,
  old_data jsonb,
  new_data jsonb,
  user_id text,
  user_email text,
  created_at timestamptz,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit int := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_offset int := GREATEST(COALESCE(p_offset, 0), 0);
  v_query text := NULLIF(btrim(COALESCE(p_query, '')), '');
  v_pattern text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'Authentication required'
        USING ERRCODE = '42501';
    END IF;

    IF NOT public.user_has_permission('access', 'view_audit_logs', NULL) THEN
      RAISE EXCEPTION 'View Audit Logs access is required'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Neutralise LIKE wildcards in user input so a search for "%" does not match
  -- everything and "_" stays a literal underscore (resource_type values such as
  -- user_role contain them).
  IF v_query IS NOT NULL THEN
    v_pattern := '%' || replace(replace(replace(v_query, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  END IF;

  RETURN QUERY
  WITH filtered AS (
    SELECT a.*
    FROM public.audit_logs a
    WHERE v_pattern IS NULL
       OR a.action ILIKE v_pattern ESCAPE '\'
       OR a.resource_type ILIKE v_pattern ESCAPE '\'
       OR a.resource_id::text ILIKE v_pattern ESCAPE '\'
       OR COALESCE(a.user_email, '') ILIKE v_pattern ESCAPE '\'
  )
  SELECT
    f.id::text,
    f.action::text,
    f.resource_type::text,
    f.resource_id::text,
    f.old_data::jsonb,
    f.new_data::jsonb,
    f.user_id::text,
    f.user_email::text,
    f.created_at::timestamptz,
    COUNT(*) OVER ()::bigint AS total_count
  FROM filtered f
  ORDER BY f.created_at DESC, f.id DESC
  LIMIT v_limit OFFSET v_offset;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.search_audit_logs(text, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_audit_logs(text, int, int) TO authenticated, service_role;

-- Keyset ordering and the newest-first listing both read created_at descending.
CREATE INDEX IF NOT EXISTS audit_logs_created_at_desc_idx
  ON public.audit_logs (created_at DESC);

COMMIT;
