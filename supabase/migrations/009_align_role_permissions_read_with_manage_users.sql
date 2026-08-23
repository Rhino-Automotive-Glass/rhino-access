BEGIN;

-- The app gates every role_permissions read on the `access.manage_users`
-- permission (GET /api/admin/users/[userId] and
-- GET /api/admin/roles/[roleId]/permissions), but the RLS policy gated it on
-- hierarchy_level >= 80. Those agree for admin and super_admin and disagree for
-- anyone below 80 who was granted manage_users through a user override: the
-- route authorizes the request, then RLS filters every row and PostgREST
-- returns an empty set with no error. The permission matrix then renders as if
-- the role grants nothing.
--
-- Align the policy with the rule the app actually enforces. Level >= 80 is kept
-- so admins keep access even if the manage_users seed is ever changed.
--
-- user_has_permission() is SECURITY DEFINER, so its body reads role_permissions
-- as the function owner and does not re-enter this policy.
DROP POLICY IF EXISTS "Admins can view role_permissions" ON public.role_permissions;

CREATE POLICY "Admins can view role_permissions"
  ON public.role_permissions FOR SELECT
  TO authenticated
  USING (
    current_user_hierarchy_level() >= 80
    OR public.user_has_permission('access', 'manage_users', NULL)
  );

COMMIT;
