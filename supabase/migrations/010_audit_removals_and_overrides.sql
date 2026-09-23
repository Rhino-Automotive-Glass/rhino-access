BEGIN;

-- Before this migration the only trigger writing audit_logs was
-- audit_user_role_changes, on user_roles INSERT OR UPDATE. That left the events
-- a permission hub most needs to answer for entirely unrecorded:
--
--   * user removal   — the delete handler removes the user_roles row, and there
--                      was no DELETE trigger, so "who revoked X's access" had
--                      no answer at all
--   * permission overrides — replace_user_permission_overrides rewrites
--                      user_permissions wholesale and logged nothing
--   * invites        — only visible indirectly, as the role row being created
--
-- audit_logs has no INSERT policy, so every writer here is SECURITY DEFINER.
-- This file has not been applied to production. Its function bodies now match
-- production after sibling migrations 015–016; apply only after live diff review.

-- ============================================================
-- 1. user_roles: add DELETE, keep INSERT/UPDATE behaviour
-- ============================================================
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

DROP TRIGGER IF EXISTS audit_user_role_changes ON public.user_roles;
CREATE TRIGGER audit_user_role_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.log_role_change();

-- ============================================================
-- 2. user_permissions: audit grant/deny overrides
-- ============================================================
-- resource_id is the SUBJECT user, not the override row id, so filtering the
-- audit log by a user id surfaces their role and override history together.
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

DROP TRIGGER IF EXISTS audit_user_permission_changes ON public.user_permissions;
CREATE TRIGGER audit_user_permission_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.user_permissions
  FOR EACH ROW EXECUTE FUNCTION public.log_permission_override_change();

-- ============================================================
-- 3. Application-level audit events
-- ============================================================
-- For things with no table mutation of their own to hang a trigger off — an
-- invite is the motivating case, where the only DB change is the role row and
-- the invited address itself would otherwise never be recorded.
CREATE OR REPLACE FUNCTION public.log_audit_event(p_action text, p_resource_type text, p_resource_id uuid DEFAULT NULL::uuid, p_new_data jsonb DEFAULT NULL::jsonb, p_old_data jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  actor_id uuid := auth.uid();
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'log_audit_event requires an authenticated actor (auth.uid() is null)'
      USING ERRCODE = '42501';
  END IF;

  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    -- Only staff who can already change access may write audit entries, so this
    -- cannot be used to forge history from a low-privilege session.
    IF public.current_user_hierarchy_level() < 80 THEN
      RAISE EXCEPTION 'Admin access is required to record audit events'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF p_action IS NULL OR p_resource_type IS NULL THEN
    RAISE EXCEPTION 'action and resource_type are required'
      USING ERRCODE = '22004';
  END IF;

  INSERT INTO public.audit_logs (
    action, resource_type, resource_id, old_data, new_data, user_id, user_email
  ) VALUES (
    p_action,
    p_resource_type,
    p_resource_id,
    p_old_data,
    p_new_data,
    actor_id,
    COALESCE((SELECT email FROM auth.users WHERE id = actor_id), 'system')
  );
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.log_audit_event(text,text,uuid,jsonb,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_audit_event(text,text,uuid,jsonb,jsonb) TO authenticated, service_role;

-- Reassert 015's private hierarchy guard if this pending migration is run.
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
REVOKE EXECUTE ON FUNCTION public.replace_user_permission_overrides(uuid, uuid[], uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_user_permission_overrides(uuid, uuid[], uuid[]) TO authenticated, service_role;

COMMIT;
