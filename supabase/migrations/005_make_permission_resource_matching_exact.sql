BEGIN;

-- Resource matching is exact: NULL only matches NULL, and concrete resources
-- only match the same concrete resource. Do not treat omitted p_resource as a
-- wildcard; callers that need a resource-scoped permission must pass it.
CREATE OR REPLACE FUNCTION public.user_has_permission(
  p_app text,
  p_action text,
  p_resource text DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.role_permissions rp ON rp.role_id = ur.role_id
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE ur.user_id = auth.uid()
      AND p.app = p_app
      AND p.action = p_action
      AND p.resource IS NOT DISTINCT FROM p_resource

    UNION ALL

    SELECT 1
    FROM public.user_permissions up
    JOIN public.permissions p ON p.id = up.permission_id
    WHERE up.user_id = auth.uid()
      AND up.granted = true
      AND p.app = p_app
      AND p.action = p_action
      AND p.resource IS NOT DISTINCT FROM p_resource
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.user_permissions up
    JOIN public.permissions p ON p.id = up.permission_id
    WHERE up.user_id = auth.uid()
      AND up.granted = false
      AND p.app = p_app
      AND p.action = p_action
      AND p.resource IS NOT DISTINCT FROM p_resource
  );
$$;

COMMIT;
