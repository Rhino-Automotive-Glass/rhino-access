BEGIN;

-- Replace user-specific permission overrides as a single database statement.
-- PostgreSQL rolls back the delete/insert work if any validation or insert fails,
-- so existing overrides remain unchanged on errors.
CREATE OR REPLACE FUNCTION public.replace_user_permission_overrides(
  p_user_id uuid,
  p_grants uuid[] DEFAULT '{}'::uuid[],
  p_revokes uuid[] DEFAULT '{}'::uuid[]
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_id uuid := auth.uid();
  grants uuid[] := COALESCE(p_grants, '{}'::uuid[]);
  revokes uuid[] := COALESCE(p_revokes, '{}'::uuid[]);
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Target user is required'
      USING ERRCODE = '22004';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM auth.users u
    WHERE u.id = p_user_id
  ) THEN
    RAISE EXCEPTION 'Target user does not exist'
      USING ERRCODE = 'P0002';
  END IF;

  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    IF actor_id IS NULL THEN
      RAISE EXCEPTION 'Authentication required'
        USING ERRCODE = '42501';
    END IF;

    IF NOT public.user_has_permission('access', 'manage_permissions', NULL) THEN
      RAISE EXCEPTION 'Manage Permissions access is required'
        USING ERRCODE = '42501';
    END IF;

    IF public.user_hierarchy_level(p_user_id) >= public.current_user_hierarchy_level() THEN
      RAISE EXCEPTION 'Cannot update permissions for a user at or above your own level'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT permission_id
      FROM unnest(grants) AS grant_items(permission_id)
      GROUP BY permission_id
      HAVING count(*) > 1
    ) duplicates
  ) THEN
    RAISE EXCEPTION 'Duplicate grant permission IDs are not allowed'
      USING ERRCODE = '22000';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT permission_id
      FROM unnest(revokes) AS revoke_items(permission_id)
      GROUP BY permission_id
      HAVING count(*) > 1
    ) duplicates
  ) THEN
    RAISE EXCEPTION 'Duplicate revoke permission IDs are not allowed'
      USING ERRCODE = '22000';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(grants) AS grant_items(permission_id)
    JOIN unnest(revokes) AS revoke_items(permission_id) USING (permission_id)
  ) THEN
    RAISE EXCEPTION 'A permission cannot be both granted and revoked'
      USING ERRCODE = '22000';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT permission_id FROM unnest(grants) AS grant_items(permission_id)
      UNION
      SELECT permission_id FROM unnest(revokes) AS revoke_items(permission_id)
    ) requested
    LEFT JOIN public.permissions p ON p.id = requested.permission_id
    WHERE p.id IS NULL
  ) THEN
    RAISE EXCEPTION 'One or more permission IDs are invalid'
      USING ERRCODE = '22000';
  END IF;

  DELETE FROM public.user_permissions
  WHERE user_id = p_user_id;

  INSERT INTO public.user_permissions (user_id, permission_id, granted, granted_by)
  SELECT p_user_id, overrides.permission_id, overrides.granted, actor_id
  FROM (
    SELECT permission_id, true AS granted
    FROM unnest(grants) AS grant_items(permission_id)

    UNION ALL

    SELECT permission_id, false AS granted
    FROM unnest(revokes) AS revoke_items(permission_id)
  ) overrides;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.replace_user_permission_overrides(uuid, uuid[], uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.replace_user_permission_overrides(uuid, uuid[], uuid[]) TO authenticated, service_role;

COMMIT;
