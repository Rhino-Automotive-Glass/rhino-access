BEGIN;

CREATE OR REPLACE FUNCTION public.user_hierarchy_level(p_user_id uuid)
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT r.hierarchy_level
     FROM user_roles ur
     JOIN roles r ON r.id = ur.role_id
     WHERE ur.user_id = p_user_id),
    0
  );
$$;

CREATE OR REPLACE FUNCTION public.current_user_hierarchy_level()
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.user_hierarchy_level(auth.uid());
$$;

-- USER_ROLES: admins may only mutate users whose current role is below their own.
-- WITH CHECK still preserves the existing rule that newly assigned roles must
-- also be below the actor's role.
DROP POLICY IF EXISTS "Admins can insert user_roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can update user_roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can delete user_roles" ON public.user_roles;

CREATE POLICY "Admins can insert user_roles"
  ON public.user_roles FOR INSERT
  TO authenticated
  WITH CHECK (
    current_user_hierarchy_level() >= 80
    AND (SELECT hierarchy_level FROM public.roles WHERE id = role_id) < current_user_hierarchy_level()
  );

CREATE POLICY "Admins can update user_roles"
  ON public.user_roles FOR UPDATE
  TO authenticated
  USING (
    current_user_hierarchy_level() >= 80
    AND public.user_hierarchy_level(user_id) < current_user_hierarchy_level()
  )
  WITH CHECK (
    current_user_hierarchy_level() >= 80
    AND (SELECT hierarchy_level FROM public.roles WHERE id = role_id) < current_user_hierarchy_level()
  );

CREATE POLICY "Admins can delete user_roles"
  ON public.user_roles FOR DELETE
  TO authenticated
  USING (
    current_user_hierarchy_level() >= 80
    AND public.user_hierarchy_level(user_id) < current_user_hierarchy_level()
  );

-- USER_PERMISSIONS: permission overrides also mutate a user's effective access,
-- so they follow the same target-below-actor rule.
DROP POLICY IF EXISTS "Admins can insert user_permissions" ON public.user_permissions;
DROP POLICY IF EXISTS "Admins can update user_permissions" ON public.user_permissions;
DROP POLICY IF EXISTS "Admins can delete user_permissions" ON public.user_permissions;

CREATE POLICY "Admins can insert user_permissions"
  ON public.user_permissions FOR INSERT
  TO authenticated
  WITH CHECK (
    current_user_hierarchy_level() >= 80
    AND public.user_hierarchy_level(user_id) < current_user_hierarchy_level()
  );

CREATE POLICY "Admins can update user_permissions"
  ON public.user_permissions FOR UPDATE
  TO authenticated
  USING (
    current_user_hierarchy_level() >= 80
    AND public.user_hierarchy_level(user_id) < current_user_hierarchy_level()
  )
  WITH CHECK (
    current_user_hierarchy_level() >= 80
    AND public.user_hierarchy_level(user_id) < current_user_hierarchy_level()
  );

CREATE POLICY "Admins can delete user_permissions"
  ON public.user_permissions FOR DELETE
  TO authenticated
  USING (
    current_user_hierarchy_level() >= 80
    AND public.user_hierarchy_level(user_id) < current_user_hierarchy_level()
  );

COMMIT;
