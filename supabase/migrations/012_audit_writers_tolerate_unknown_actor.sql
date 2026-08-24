BEGIN;

-- audit_logs.user_id is NOT NULL, but the audit writers added in migration 010
-- record auth.uid() as the actor, which is NULL whenever there is no JWT:
-- service_role calls, the SQL editor, or an ON DELETE CASCADE from auth.users.
--
-- The dangerous case is the user_roles DELETE trigger. Deleting a user from the
-- Supabase dashboard cascades into user_roles, the trigger fires with a NULL
-- actor, the insert violates the constraint, and the DELETE ITSELF FAILS. In
-- other words 010 could block user deletion performed anywhere other than
-- through this app.
--
-- Fall back to an actor that is guaranteed non-null while keeping the row
-- honest: user_email is set to 'system' whenever the real actor is unknown, so
-- a fallback id is never mistaken for a genuine attribution. The pre-existing
-- INSERT/UPDATE path already used this pattern.
--
-- audit_logs is shared with the other apps on this project, so the NOT NULL
-- constraint is deliberately left alone rather than relaxed underneath them.

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

COMMIT;
