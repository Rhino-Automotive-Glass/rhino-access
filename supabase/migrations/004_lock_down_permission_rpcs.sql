BEGIN;

-- SECURITY DEFINER functions bypass table RLS, so the function body must enforce
-- who can inspect which user's resolved permissions.
CREATE OR REPLACE FUNCTION public.get_user_permissions(p_user_id uuid)
RETURNS TABLE (app text, action text, resource text)
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

    IF p_user_id IS DISTINCT FROM auth.uid()
       AND public.current_user_hierarchy_level() < 80 THEN
      RAISE EXCEPTION 'Not allowed to inspect permissions for another user'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN QUERY
  SELECT DISTINCT p.app, p.action, p.resource
  FROM (
    SELECT rp.permission_id
    FROM public.user_roles ur
    JOIN public.role_permissions rp ON rp.role_id = ur.role_id
    WHERE ur.user_id = p_user_id

    UNION

    SELECT up.permission_id
    FROM public.user_permissions up
    WHERE up.user_id = p_user_id AND up.granted = true
  ) granted
  JOIN public.permissions p ON p.id = granted.permission_id
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.user_permissions up2
    WHERE up2.user_id = p_user_id
      AND up2.permission_id = granted.permission_id
      AND up2.granted = false
  );
END;
$$;

-- Child apps should use this by default instead of passing a user id.
CREATE OR REPLACE FUNCTION public.get_my_permissions()
RETURNS TABLE (app text, action text, resource text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.get_user_permissions(auth.uid());
$$;

REVOKE EXECUTE ON FUNCTION public.get_user_permissions(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_my_permissions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_permissions(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_permissions() TO authenticated, service_role;

COMMIT;
