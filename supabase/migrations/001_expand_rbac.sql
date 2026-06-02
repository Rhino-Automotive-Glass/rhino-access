-- ============================================================
-- Migration: Expand RBAC system
-- Adds: roles, permissions, role_permissions, user_permissions
-- Alters: user_roles (varchar role → FK role_id)
-- Adds: RLS policies, helper functions, triggers
-- ============================================================

BEGIN;

-- ============================================================
-- 1. ROLES TABLE
-- ============================================================
CREATE TABLE public.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  display_name text NOT NULL,
  description text,
  hierarchy_level int NOT NULL DEFAULT 0,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.roles (name, display_name, description, hierarchy_level, is_system) VALUES
  ('super_admin',       'Super Admin',       'Full system access, can manage all roles and permissions',  100, true),
  ('admin',             'Admin',             'Can manage users and most settings',                        80,  true),
  ('editor',            'Editor',            'Can create and edit content across apps',                   60,  true),
  ('quality_assurance', 'Quality Assurance', 'Can review, approve/reject, and flag items',                50,  true),
  ('approver',          'Approver',          'Can approve submissions and changes',                       40,  true),
  ('viewer',            'Viewer',            'Read-only access',                                          10,  true);

-- ============================================================
-- 2. PERMISSIONS TABLE
-- ============================================================
CREATE TABLE public.permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app text NOT NULL,
  action text NOT NULL,
  resource text,
  display_name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE(app, action, resource)
);

-- Rhino Access
INSERT INTO public.permissions (app, action, resource, display_name, description) VALUES
  ('access', 'manage_users',       NULL, 'Manage Users',       'Add, remove, and edit users'),
  ('access', 'manage_roles',       NULL, 'Manage Roles',       'Create and edit role definitions'),
  ('access', 'manage_permissions', NULL, 'Manage Permissions', 'Assign permissions to roles and users'),
  ('access', 'view_audit_logs',    NULL, 'View Audit Logs',    'View system audit trail');

-- Rhino Origin
INSERT INTO public.permissions (app, action, resource, display_name, description) VALUES
  ('origin', 'view',    'origin_sheets', 'View Origin Sheets',    'View origin sheet data'),
  ('origin', 'create',  'origin_sheets', 'Create Origin Sheets',  'Create new origin sheets'),
  ('origin', 'edit',    'origin_sheets', 'Edit Origin Sheets',    'Modify origin sheet data'),
  ('origin', 'delete',  'origin_sheets', 'Delete Origin Sheets',  'Remove origin sheets'),
  ('origin', 'approve', 'origin_sheets', 'Approve Origin Sheets', 'Approve origin sheet submissions');

-- Rhino Code
INSERT INTO public.permissions (app, action, resource, display_name, description) VALUES
  ('code', 'view',   'product_codes', 'View Product Codes',   'View product code data'),
  ('code', 'create', 'product_codes', 'Create Product Codes', 'Create new product codes'),
  ('code', 'edit',   'product_codes', 'Edit Product Codes',   'Modify product code data'),
  ('code', 'delete', 'product_codes', 'Delete Product Codes', 'Remove product codes');

-- Rhino Stock
INSERT INTO public.permissions (app, action, resource, display_name, description) VALUES
  ('stock', 'view',             'inventory', 'View Inventory',         'View inventory levels'),
  ('stock', 'adjust_inventory', 'inventory', 'Adjust Inventory',       'Modify stock quantities'),
  ('stock', 'create',           'inventory', 'Create Inventory Items', 'Add new inventory items'),
  ('stock', 'delete',           'inventory', 'Delete Inventory Items', 'Remove inventory items');

-- ============================================================
-- 3. ROLE_PERMISSIONS (junction table)
-- ============================================================
CREATE TABLE public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE(role_id, permission_id)
);

-- super_admin gets everything
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r, public.permissions p
WHERE r.name = 'super_admin';

-- admin gets everything except manage_roles and manage_permissions
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r, public.permissions p
WHERE r.name = 'admin'
  AND NOT (p.app = 'access' AND p.action IN ('manage_roles', 'manage_permissions'));

-- editor gets view + create + edit across all non-access apps
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r, public.permissions p
WHERE r.name = 'editor'
  AND p.app != 'access'
  AND p.action IN ('view', 'create', 'edit');

-- quality_assurance gets view + approve across non-access apps
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r, public.permissions p
WHERE r.name = 'quality_assurance'
  AND p.app != 'access'
  AND p.action IN ('view', 'approve');

-- approver gets view + approve across non-access apps
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r, public.permissions p
WHERE r.name = 'approver'
  AND p.app != 'access'
  AND p.action IN ('view', 'approve');

-- viewer gets view only across non-access apps
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r, public.permissions p
WHERE r.name = 'viewer'
  AND p.app != 'access'
  AND p.action = 'view';

-- ============================================================
-- 4. USER_PERMISSIONS (per-user overrides)
-- ============================================================
CREATE TABLE public.user_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  granted boolean NOT NULL DEFAULT true,
  granted_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE(user_id, permission_id)
);

-- ============================================================
-- 5. MIGRATE user_roles: varchar role → FK role_id
-- ============================================================

-- 5a. Drop ALL existing policies that depend on user_roles.role
--     (these were created by previous app migrations)

-- audit_logs policies referencing user_roles.role
DROP POLICY IF EXISTS "Only admins can view audit logs" ON public.audit_logs;

-- product_codes policies referencing user_roles.role
DROP POLICY IF EXISTS "Only admins can create products" ON public.product_codes;
DROP POLICY IF EXISTS "Only admins can fully update products" ON public.product_codes;
DROP POLICY IF EXISTS "QA can toggle verified field only" ON public.product_codes;
DROP POLICY IF EXISTS "Only admins can delete products" ON public.product_codes;

-- user_roles policies referencing the old role column
DROP POLICY IF EXISTS "Allow role insertion" ON public.user_roles;

-- 5b. Add new column
ALTER TABLE public.user_roles ADD COLUMN role_id uuid REFERENCES public.roles(id);

-- 5c. Backfill existing rows
UPDATE public.user_roles ur
SET role_id = r.id
FROM public.roles r
WHERE (ur.role = 'admin'  AND r.name = 'admin')
   OR (ur.role = 'qa'     AND r.name = 'quality_assurance')
   OR (ur.role = 'viewer' AND r.name = 'viewer');

-- 5d. Set NOT NULL after backfill
ALTER TABLE public.user_roles ALTER COLUMN role_id SET NOT NULL;

-- 5e. Drop old varchar column (now safe — dependent policies are gone)
ALTER TABLE public.user_roles DROP COLUMN role;

-- 5f. Recreate the dropped policies using the new roles table join
--     Helper: checks if user has a role at or above a given hierarchy level
--     (defined fully in section 6, but we use a simpler inline check here)

-- audit_logs: admins+ can view
CREATE POLICY "Only admins can view audit logs"
  ON public.audit_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid() AND r.hierarchy_level >= 80
    )
  );

-- product_codes: admins+ can create
CREATE POLICY "Only admins can create products"
  ON public.product_codes FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid() AND r.hierarchy_level >= 80
    )
  );

-- product_codes: admins+ can fully update
CREATE POLICY "Only admins can fully update products"
  ON public.product_codes FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid() AND r.hierarchy_level >= 80
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid() AND r.hierarchy_level >= 80
    )
  );

-- product_codes: QA-level users can toggle verified field only.
-- The trigger created in section 6 enforces the column-level restriction.
CREATE POLICY "QA can toggle verified field only"
  ON public.product_codes FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid()
        AND r.hierarchy_level >= 50
        AND r.hierarchy_level < 80
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid()
        AND r.hierarchy_level >= 50
        AND r.hierarchy_level < 80
    )
  );

-- product_codes: admins+ can delete
CREATE POLICY "Only admins can delete products"
  ON public.product_codes FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid() AND r.hierarchy_level >= 80
    )
  );

-- ============================================================
-- 6. HELPER FUNCTIONS
-- ============================================================

-- updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_roles_updated_at ON public.roles;
CREATE TRIGGER set_roles_updated_at
  BEFORE UPDATE ON public.roles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS set_user_roles_updated_at ON public.user_roles;
CREATE TRIGGER set_user_roles_updated_at
  BEFORE UPDATE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Get a user's hierarchy level
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

-- Get current user's hierarchy level
CREATE OR REPLACE FUNCTION public.current_user_hierarchy_level()
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.user_hierarchy_level(auth.uid());
$$;

-- Enforce column-level safety for QA product verification updates.
-- RLS decides which rows QA users may touch; this trigger ensures QA users
-- cannot change anything except verified. Admins keep full update access.
CREATE OR REPLACE FUNCTION public.enforce_product_codes_verified_only_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_level int := public.current_user_hierarchy_level();
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF actor_level >= 80 THEN
    RETURN NEW;
  END IF;

  IF actor_level >= 50
     AND (to_jsonb(NEW) - 'verified') IS NOT DISTINCT FROM (to_jsonb(OLD) - 'verified') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'QA users can only update product_codes.verified'
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS aaa_enforce_product_codes_verified_only_update ON public.product_codes;
CREATE TRIGGER aaa_enforce_product_codes_verified_only_update
  BEFORE UPDATE ON public.product_codes
  FOR EACH ROW EXECUTE FUNCTION public.enforce_product_codes_verified_only_update();

-- Check if current user has a specific permission
-- Resource matching is exact: NULL only matches NULL, and concrete resources
-- only match the same concrete resource.
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
    FROM user_roles ur
    JOIN role_permissions rp ON rp.role_id = ur.role_id
    JOIN permissions p ON p.id = rp.permission_id
    WHERE ur.user_id = auth.uid()
      AND p.app = p_app
      AND p.action = p_action
      AND p.resource IS NOT DISTINCT FROM p_resource

    UNION ALL

    SELECT 1
    FROM user_permissions up
    JOIN permissions p ON p.id = up.permission_id
    WHERE up.user_id = auth.uid()
      AND up.granted = true
      AND p.app = p_app
      AND p.action = p_action
      AND p.resource IS NOT DISTINCT FROM p_resource
  )
  AND NOT EXISTS (
    SELECT 1
    FROM user_permissions up
    JOIN permissions p ON p.id = up.permission_id
    WHERE up.user_id = auth.uid()
      AND up.granted = false
      AND p.app = p_app
      AND p.action = p_action
      AND p.resource IS NOT DISTINCT FROM p_resource
  );
$$;

-- Get all resolved permissions for a user.
-- Normal users can only read their own permissions; admins can inspect others.
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

-- Safe default permission lookup for shared child apps.
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

-- Atomically replace all user-specific permission overrides.
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

-- ============================================================
-- 7. DEFAULT ROLE ASSIGNMENT ON USER CREATION
-- ============================================================
CREATE OR REPLACE FUNCTION public.assign_default_role()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role_id)
  SELECT NEW.id, r.id
  FROM public.roles r
  WHERE r.name = 'viewer'
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.assign_default_role();

-- ============================================================
-- 8. AUDIT LOG TRIGGER FOR ROLE CHANGES
-- ============================================================
CREATE OR REPLACE FUNCTION public.log_role_change()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.audit_logs (
    action, resource_type, resource_id,
    old_data, new_data, user_id, user_email
  ) VALUES (
    CASE WHEN TG_OP = 'INSERT' THEN 'create' ELSE 'update' END,
    'user_role',
    NEW.user_id,
    CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
    to_jsonb(NEW),
    COALESCE(NEW.assigned_by, NEW.user_id),
    COALESCE(
      (SELECT email FROM auth.users WHERE id = NEW.assigned_by),
      (SELECT email FROM auth.users WHERE id = NEW.user_id),
      'system'
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS audit_user_role_changes ON public.user_roles;
CREATE TRIGGER audit_user_role_changes
  AFTER INSERT OR UPDATE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.log_role_change();

-- ============================================================
-- 9. RLS POLICIES
-- ============================================================

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- ROLES: all authenticated can read
CREATE POLICY "Authenticated users can view roles"
  ON public.roles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Only super_admin can insert roles"
  ON public.roles FOR INSERT
  TO authenticated
  WITH CHECK (current_user_hierarchy_level() >= 100);

CREATE POLICY "Only super_admin can update roles"
  ON public.roles FOR UPDATE
  TO authenticated
  USING (current_user_hierarchy_level() >= 100)
  WITH CHECK (current_user_hierarchy_level() >= 100);

CREATE POLICY "Only super_admin can delete roles"
  ON public.roles FOR DELETE
  TO authenticated
  USING (current_user_hierarchy_level() >= 100 AND is_system = false);

-- PERMISSIONS: all authenticated can read
CREATE POLICY "Authenticated users can view permissions"
  ON public.permissions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Only super_admin can insert permissions"
  ON public.permissions FOR INSERT
  TO authenticated
  WITH CHECK (current_user_hierarchy_level() >= 100);

CREATE POLICY "Only super_admin can update permissions"
  ON public.permissions FOR UPDATE
  TO authenticated
  USING (current_user_hierarchy_level() >= 100)
  WITH CHECK (current_user_hierarchy_level() >= 100);

CREATE POLICY "Only super_admin can delete permissions"
  ON public.permissions FOR DELETE
  TO authenticated
  USING (current_user_hierarchy_level() >= 100);

-- ROLE_PERMISSIONS: admins+ can read, super_admin can modify
CREATE POLICY "Admins can view role_permissions"
  ON public.role_permissions FOR SELECT
  TO authenticated
  USING (current_user_hierarchy_level() >= 80);

CREATE POLICY "Only super_admin can insert role_permissions"
  ON public.role_permissions FOR INSERT
  TO authenticated
  WITH CHECK (current_user_hierarchy_level() >= 100);

CREATE POLICY "Only super_admin can update role_permissions"
  ON public.role_permissions FOR UPDATE
  TO authenticated
  USING (current_user_hierarchy_level() >= 100)
  WITH CHECK (current_user_hierarchy_level() >= 100);

CREATE POLICY "Only super_admin can delete role_permissions"
  ON public.role_permissions FOR DELETE
  TO authenticated
  USING (current_user_hierarchy_level() >= 100);

-- USER_ROLES: users can read own, admins+ can read all and manage
CREATE POLICY "Users can view own role"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can view all user_roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (current_user_hierarchy_level() >= 80);

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

-- USER_PERMISSIONS: users can read own, admins+ can read all and manage
CREATE POLICY "Users can view own permissions"
  ON public.user_permissions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can view all user_permissions"
  ON public.user_permissions FOR SELECT
  TO authenticated
  USING (current_user_hierarchy_level() >= 80);

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
