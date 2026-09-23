-- Already applied to production 2026-09-19 via rhino-product-code-description 013–016. Recorded here to prevent regressions. Do not re-apply blindly.
-- Production definitions below were read from pg_get_functiondef on project
-- uzgomevojvzdzfunjhdr. The product-code update body also records the later
-- production editor fix; the removed signup trigger records migration 018.
-- The role_permissions read policy must match production's admin-only rule.
-- Sibling-owned product read/create and audit insert policies are asserted
-- before dropping old policies; this prevents an incomplete cross-repo replay.

BEGIN;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'role_permissions'
      AND policyname = 'Admins can view role_permissions'
      AND roles = ARRAY['authenticated']::name[]
      AND cmd = 'SELECT'
      AND qual = '(current_user_hierarchy_level() >= 80)'
  ) THEN
    RAISE EXCEPTION 'role_permissions policy differs from production; review policy drift before proceeding';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
    WHERE schemaname = 'public' AND tablename = 'product_codes'
      AND policyname = 'Allow public read access'
      AND permissive = 'PERMISSIVE'
      AND roles = ARRAY['public']::name[]
      AND cmd = 'SELECT' AND qual = 'true' AND with_check IS NULL
  ) THEN
    RAISE EXCEPTION 'product_codes public-read policy differs from production; apply sibling policy first';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
    WHERE schemaname = 'public' AND tablename = 'product_codes'
      AND policyname = 'Editors can create product codes'
      AND permissive = 'PERMISSIVE'
      AND roles = ARRAY['authenticated']::name[]
      AND cmd = 'INSERT' AND qual IS NULL
      AND with_check = '(( SELECT current_user_hierarchy_level() AS current_user_hierarchy_level) >= 60)'
  ) THEN
    RAISE EXCEPTION 'product_codes editor-create policy differs from production; apply sibling policy first';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
    WHERE schemaname = 'public' AND tablename = 'audit_logs'
      AND policyname = 'System can insert audit logs'
      AND permissive = 'PERMISSIVE'
      AND roles = ARRAY['authenticated']::name[]
      AND cmd = 'INSERT' AND qual IS NULL
      AND with_check = '(user_id = auth.uid())'
  ) THEN
    RAISE EXCEPTION 'audit_logs insert policy differs from production; apply sibling policy first';
  END IF;
END;
$$;

-- Live: private.hierarchy_level(uuid)
CREATE OR REPLACE FUNCTION private.hierarchy_level(p_user_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  SELECT COALESCE(
    (SELECT r.hierarchy_level
     FROM public.user_roles ur
     JOIN public.roles r ON r.id = ur.role_id
     WHERE ur.user_id = p_user_id),
    0
  );
$function$;
COMMENT ON FUNCTION private.hierarchy_level(uuid) IS
  'Real role-level lookup. Internal: called only by SECURITY DEFINER functions owned by postgres. See migration 015.';
REVOKE ALL ON FUNCTION private.hierarchy_level(uuid) FROM PUBLIC, anon, authenticated, service_role;

-- Live: public.user_hierarchy_level(uuid)
CREATE OR REPLACE FUNCTION public.user_hierarchy_level(p_user_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT CASE
    WHEN p_user_id = auth.uid()
      OR auth.role() = 'service_role'
      OR private.hierarchy_level(auth.uid()) >= 80
    THEN private.hierarchy_level(p_user_id)
    ELSE 0
  END;
$function$;
REVOKE EXECUTE ON FUNCTION public.user_hierarchy_level(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_hierarchy_level(uuid) TO authenticated, service_role;

-- Live: public.current_user_hierarchy_level()
CREATE OR REPLACE FUNCTION public.current_user_hierarchy_level()
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT private.hierarchy_level(auth.uid());
$function$;
REVOKE EXECUTE ON FUNCTION public.current_user_hierarchy_level() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_hierarchy_level() TO authenticated, service_role;

-- Live: public.replace_user_permission_overrides(uuid,uuid[],uuid[])
CREATE OR REPLACE FUNCTION public.replace_user_permission_overrides(p_user_id uuid, p_grants uuid[] DEFAULT '{}'::uuid[], p_revokes uuid[] DEFAULT '{}'::uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

    -- 015: compare real levels via the private helper (the public wrapper
    -- returns 0 for non-admin callers asking about other users).
    IF private.hierarchy_level(p_user_id) >= private.hierarchy_level(actor_id) THEN
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
$function$;
REVOKE EXECUTE ON FUNCTION public.replace_user_permission_overrides(uuid,uuid[],uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_user_permission_overrides(uuid,uuid[],uuid[]) TO authenticated, service_role;

-- Live: public.log_role_change()
CREATE OR REPLACE FUNCTION public.log_role_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  known_actor uuid := auth.uid();
  actor_id uuid;
  actor_email text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- OLD.assigned_by is whoever granted the role, not whoever is removing it,
    -- so it is only a fallback for attribution of last resort.
    actor_id := COALESCE(known_actor, OLD.assigned_by, OLD.user_id);
    -- 016: the actor can be the user being deleted (their user_roles /
    -- user_permissions rows cascade away with them). Referencing them would
    -- violate audit_logs' foreign key; record NULL, user_email keeps who.
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = actor_id) THEN
      actor_id := NULL;
    END IF;
    actor_email := COALESCE(
      (SELECT email FROM auth.users WHERE id = known_actor),
      'system'
    );

    INSERT INTO public.audit_logs (
      action, resource_type, resource_id, old_data, new_data, user_id, user_email
    ) VALUES (
      'delete', 'user_role', OLD.user_id, to_jsonb(OLD), NULL,
      actor_id, actor_email
    );

    RETURN OLD;
  END IF;

  actor_id := COALESCE(NEW.assigned_by, known_actor, NEW.user_id);
  actor_email := COALESCE(
    (SELECT email FROM auth.users WHERE id = actor_id),
    (SELECT email FROM auth.users WHERE id = NEW.user_id),
    'system'
  );

  INSERT INTO public.audit_logs (
    action, resource_type, resource_id, old_data, new_data, user_id, user_email
  ) VALUES (
    CASE WHEN TG_OP = 'INSERT' THEN 'create' ELSE 'update' END,
    'user_role',
    NEW.user_id,
    CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
    to_jsonb(NEW),
    actor_id,
    actor_email
  );

  RETURN NEW;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.log_role_change() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_role_change() TO authenticated, service_role;

-- Live: public.log_permission_override_change()
CREATE OR REPLACE FUNCTION public.log_permission_override_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  known_actor uuid := auth.uid();
  subject_id uuid := COALESCE(NEW.user_id, OLD.user_id);
  granted_by_id uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.granted_by ELSE NEW.granted_by END;
  actor_id uuid := COALESCE(known_actor, granted_by_id, subject_id);
BEGIN
  -- 016: the actor can be the user being deleted (their user_roles /
  -- user_permissions rows cascade away with them). Referencing them would
  -- violate audit_logs' foreign key; record NULL, user_email keeps who.
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = actor_id) THEN
    actor_id := NULL;
  END IF;

  INSERT INTO public.audit_logs (
    action, resource_type, resource_id, old_data, new_data, user_id, user_email
  ) VALUES (
    CASE TG_OP
      WHEN 'INSERT' THEN 'create'
      WHEN 'UPDATE' THEN 'update'
      ELSE 'delete'
    END,
    'user_permission',
    subject_id,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END,
    actor_id,
    COALESCE((SELECT email FROM auth.users WHERE id = known_actor), 'system')
  );

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.log_permission_override_change() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_permission_override_change() TO authenticated, service_role;

-- Live: public.enforce_product_codes_verified_only_update()
CREATE OR REPLACE FUNCTION public.enforce_product_codes_verified_only_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  actor_level int := public.current_user_hierarchy_level();
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF actor_level >= 60 THEN
    RETURN NEW;
  END IF;

  IF actor_level >= 50
     AND (to_jsonb(NEW) - 'verified') IS NOT DISTINCT FROM (to_jsonb(OLD) - 'verified') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'QA users can only update product_codes.verified'
    USING ERRCODE = '42501';
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.enforce_product_codes_verified_only_update() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enforce_product_codes_verified_only_update() TO authenticated, service_role;

-- Preserve live search_path on remaining functions defined by this repo.
ALTER FUNCTION public.update_updated_at() SET search_path = '';
ALTER FUNCTION public.user_has_permission(text, text, text) SET search_path = public;
ALTER FUNCTION public.get_user_permissions(uuid) SET search_path = public;
ALTER FUNCTION public.get_my_permissions() SET search_path = public;
ALTER FUNCTION public.get_app_access_counts() SET search_path = public;
ALTER FUNCTION public.log_audit_event(text, text, uuid, jsonb, jsonb) SET search_path = public;
ALTER FUNCTION public.search_audit_logs(text, integer, integer) SET search_path = public;

ALTER TABLE public.audit_logs ALTER COLUMN user_id DROP NOT NULL;
COMMENT ON COLUMN public.audit_logs.user_id IS
  'Acting user. NULL once that user has been deleted (FK ON DELETE SET NULL); user_email still identifies them.';
ALTER TABLE public.user_roles DROP CONSTRAINT user_roles_assigned_by_fkey,
  ADD CONSTRAINT user_roles_assigned_by_fkey
  FOREIGN KEY (assigned_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.user_permissions DROP CONSTRAINT user_permissions_granted_by_fkey,
  ADD CONSTRAINT user_permissions_granted_by_fkey
  FOREIGN KEY (granted_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- Policies removed from production in migration 014.
DROP POLICY IF EXISTS "Admins can read all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can read own role" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view their own role" ON public.user_roles;
DROP POLICY IF EXISTS "product_codes_select" ON public.product_codes;
DROP POLICY IF EXISTS "product_codes_insert" ON public.product_codes;
DROP POLICY IF EXISTS "product_codes_update" ON public.product_codes;
DROP POLICY IF EXISTS "product_codes_delete" ON public.product_codes;
DROP POLICY IF EXISTS "All authenticated users can read products" ON public.product_codes;
DROP POLICY IF EXISTS "Only admins can create products" ON public.product_codes;

DROP FUNCTION IF EXISTS public.is_admin(uuid);
DROP FUNCTION IF EXISTS public.is_admin();
DROP FUNCTION IF EXISTS public.user_has_role(uuid, character varying);
DROP FUNCTION IF EXISTS public.get_user_role(uuid);

-- Production migration 018 removed automatic viewer assignment.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.assign_default_role();

COMMIT;
