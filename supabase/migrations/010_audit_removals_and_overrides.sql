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

-- ============================================================
-- 1. user_roles: add DELETE, keep INSERT/UPDATE behaviour
-- ============================================================
CREATE OR REPLACE FUNCTION public.log_role_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_id uuid;
  subject_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- OLD.assigned_by is whoever last granted the role, not whoever is removing
    -- it, so auth.uid() is the only correct actor here.
    actor_id := auth.uid();
    subject_id := OLD.user_id;

    INSERT INTO public.audit_logs (
      action, resource_type, resource_id, old_data, new_data, user_id, user_email
    ) VALUES (
      'delete',
      'user_role',
      subject_id,
      to_jsonb(OLD),
      NULL,
      actor_id,
      COALESCE(
        (SELECT email FROM auth.users WHERE id = actor_id),
        'system'
      )
    );

    RETURN OLD;
  END IF;

  -- INSERT/UPDATE: preserve the original actor precedence so existing history
  -- stays consistent. auth.uid() slots in ahead of the subject as a better
  -- fallback when assigned_by is null.
  actor_id := COALESCE(NEW.assigned_by, auth.uid(), NEW.user_id);

  INSERT INTO public.audit_logs (
    action, resource_type, resource_id, old_data, new_data, user_id, user_email
  ) VALUES (
    CASE WHEN TG_OP = 'INSERT' THEN 'create' ELSE 'update' END,
    'user_role',
    NEW.user_id,
    CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
    to_jsonb(NEW),
    actor_id,
    COALESCE(
      (SELECT email FROM auth.users WHERE id = actor_id),
      (SELECT email FROM auth.users WHERE id = NEW.user_id),
      'system'
    )
  );

  RETURN NEW;
END;
$$;

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
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_id uuid := auth.uid();
  subject_id uuid := COALESCE(NEW.user_id, OLD.user_id);
BEGIN
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
    COALESCE(actor_id, CASE WHEN TG_OP = 'DELETE' THEN OLD.granted_by ELSE NEW.granted_by END),
    COALESCE(
      (SELECT email FROM auth.users WHERE id = actor_id),
      'system'
    )
  );

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

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
CREATE OR REPLACE FUNCTION public.log_audit_event(
  p_action text,
  p_resource_type text,
  p_resource_id uuid DEFAULT NULL,
  p_new_data jsonb DEFAULT NULL,
  p_old_data jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_id uuid := auth.uid();
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    IF actor_id IS NULL THEN
      RAISE EXCEPTION 'Authentication required'
        USING ERRCODE = '42501';
    END IF;

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
$$;

REVOKE EXECUTE ON FUNCTION public.log_audit_event(text, text, uuid, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_audit_event(text, text, uuid, jsonb, jsonb) TO authenticated, service_role;

COMMIT;
