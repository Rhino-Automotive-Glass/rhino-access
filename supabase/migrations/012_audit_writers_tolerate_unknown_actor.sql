BEGIN;

-- Audit writers here match production after sibling migration 016. When no
-- authenticated actor exists, preserve a fallback email of 'system'. If the
-- fallback actor was deleted from auth.users, store NULL in audit_logs.user_id
-- rather than violating its foreign key. Production made this column nullable.
-- Re-running this migration must not restore the pre-016 audit function bodies.

CREATE OR REPLACE FUNCTION public.log_role_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;
REVOKE EXECUTE ON FUNCTION public.log_role_change() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_role_change() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.log_permission_override_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;
REVOKE EXECUTE ON FUNCTION public.log_permission_override_change() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_permission_override_change() TO authenticated, service_role;

-- log_audit_event records application events that have no subject row to fall
-- back on, so an unknown actor is a genuine error. Fail with a clear message
-- instead of letting it surface as a NOT NULL constraint violation.
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
$$;
REVOKE EXECUTE ON FUNCTION public.log_audit_event(text,text,uuid,jsonb,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_audit_event(text,text,uuid,jsonb,jsonb) TO authenticated, service_role;

COMMIT;
