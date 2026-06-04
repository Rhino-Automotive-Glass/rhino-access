BEGIN;

-- Count users with effective app access for admin summaries.
-- Child apps use effective view permissions. Rhino Access has no view action,
-- so it intentionally counts users with any effective access-app permission.
CREATE OR REPLACE FUNCTION public.get_app_access_counts()
RETURNS TABLE (app text, users_with_access bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'Authentication required'
        USING ERRCODE = '42501';
    END IF;

    IF NOT public.user_has_permission('access', 'manage_users', NULL) THEN
      RAISE EXCEPTION 'Manage Users access is required'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN QUERY
  WITH granted AS (
    SELECT ur.user_id, rp.permission_id
    FROM public.user_roles ur
    JOIN public.role_permissions rp ON rp.role_id = ur.role_id

    UNION

    SELECT up.user_id, up.permission_id
    FROM public.user_permissions up
    WHERE up.granted = true
  ),
  effective AS (
    SELECT g.user_id, p.app, p.action
    FROM granted g
    JOIN public.permissions p ON p.id = g.permission_id
    JOIN auth.users u ON u.id = g.user_id
    WHERE u.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.user_permissions up2
        WHERE up2.user_id = g.user_id
          AND up2.permission_id = g.permission_id
          AND up2.granted = false
      )
  )
  SELECT e.app, count(DISTINCT e.user_id)::bigint AS users_with_access
  FROM effective e
  WHERE e.action = 'view'
     OR (
       e.app = 'access'
       AND NOT EXISTS (
         SELECT 1
         FROM public.permissions access_view
         WHERE access_view.app = 'access'
           AND access_view.action = 'view'
       )
     )
  GROUP BY e.app;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_app_access_counts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_app_access_counts() TO authenticated, service_role;

COMMIT;
