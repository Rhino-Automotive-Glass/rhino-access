BEGIN;

CREATE TABLE IF NOT EXISTS public.connected_apps (
  key text PRIMARY KEY,
  display_name text NOT NULL,
  description text,
  url text,
  color text NOT NULL DEFAULT 'bg-slate-500',
  sort_order int NOT NULL DEFAULT 999,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.connected_apps
  (key, display_name, description, url, color, sort_order, is_active)
VALUES
  ('access',          'Rhino Access',          'Centralized user, role, and permission management', 'https://rhino-access.vercel.app',                   'bg-blue-500',    10, true),
  ('catalog',         'Rhino Catalog',         'Internal product catalog management',               'https://rhino-catalog.vercel.app',                  'bg-cyan-500',    20, true),
  ('landing_catalog', 'Rhino Landing Catalog', 'Public catalog and customer-facing landing site',    'https://rhinoautoglass.mx',                         'bg-rose-500',    30, true),
  ('origin',          'Rhino Origin',          'Origin sheets and source formats',                   'https://rhino-origin.vercel.app',                   'bg-emerald-500', 40, true),
  ('plan',            'Rhino Plan',            'Planning and kanban workflow',                       'https://rhino-plan.vercel.app',                     'bg-lime-600',    50, true),
  ('code',            'Rhino Code',            'Product code and description management',            'https://rhino-product-code-description.vercel.app', 'bg-violet-500',  60, true),
  ('stock',           'Rhino Stock',           'Inventory and stock management',                     'https://rhino-stock.vercel.app',                    'bg-amber-500',   70, true)
ON CONFLICT (key) DO UPDATE
SET display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    url = EXCLUDED.url,
    color = EXCLUDED.color,
    sort_order = EXCLUDED.sort_order,
    is_active = EXCLUDED.is_active,
    updated_at = now();

WITH new_permissions(app, action, resource, display_name, description) AS (
  VALUES
    ('catalog', 'view',   'products',       'View Catalog Products',       'View catalog product records'),
    ('catalog', 'edit',   'products',       'Edit Catalog Products',       'Modify catalog-owned product fields'),
    ('catalog', 'edit',   'product_images', 'Edit Catalog Product Images', 'Upload and remove catalog product images'),
    ('catalog', 'view',   'product_groups', 'View Product Groups',         'View curated catalog product groups'),
    ('catalog', 'create', 'product_groups', 'Create Product Groups',       'Create curated catalog product groups'),
    ('catalog', 'edit',   'product_groups', 'Edit Product Groups',         'Modify curated catalog product groups'),
    ('catalog', 'delete', 'product_groups', 'Delete Product Groups',       'Remove curated catalog product groups'),
    ('landing_catalog', 'view',   'public_catalog', 'View Landing Catalog', 'View public catalog content'),
    ('landing_catalog', 'view',   'sales_agents',   'View Sales Agents',    'View sales agent landing data'),
    ('landing_catalog', 'create', 'sales_agents',   'Create Sales Agents',  'Create sales agent landing entries'),
    ('landing_catalog', 'edit',   'sales_agents',   'Edit Sales Agents',    'Modify sales agent landing entries'),
    ('landing_catalog', 'delete', 'sales_agents',   'Delete Sales Agents',  'Remove sales agent landing entries'),
    ('landing_catalog', 'view',   'contact_leads',  'View Contact Leads',   'View landing page contact requests'),
    ('plan', 'view',   'tasks',        'View Plan Tasks',   'View planning tasks'),
    ('plan', 'create', 'tasks',        'Create Plan Tasks', 'Create planning tasks'),
    ('plan', 'edit',   'tasks',        'Edit Plan Tasks',   'Modify planning tasks'),
    ('plan', 'delete', 'tasks',        'Delete Plan Tasks', 'Remove planning tasks'),
    ('plan', 'view',   'origin_links', 'View Origin Links', 'View origin sheet links on planning tasks'),
    ('plan', 'edit',   'origin_links', 'Edit Origin Links', 'Attach and update origin sheet links on planning tasks')
)
INSERT INTO public.permissions (app, action, resource, display_name, description)
SELECT np.app, np.action, np.resource, np.display_name, np.description
FROM new_permissions np
WHERE NOT EXISTS (
  SELECT 1
  FROM public.permissions p
  WHERE p.app = np.app
    AND p.action = np.action
    AND p.resource IS NOT DISTINCT FROM np.resource
);

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'super_admin'
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'admin'
  AND NOT (p.app = 'access' AND p.action IN ('manage_roles', 'manage_permissions'))
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'editor'
  AND p.app != 'access'
  AND p.action IN ('view', 'create', 'edit')
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'quality_assurance'
  AND p.app != 'access'
  AND p.action IN ('view', 'approve')
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'approver'
  AND p.app != 'access'
  AND p.action IN ('view', 'approve')
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'viewer'
  AND p.app != 'access'
  AND p.action = 'view'
ON CONFLICT (role_id, permission_id) DO NOTHING;

DROP TRIGGER IF EXISTS set_connected_apps_updated_at ON public.connected_apps;
CREATE TRIGGER set_connected_apps_updated_at
  BEFORE UPDATE ON public.connected_apps
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.connected_apps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view connected_apps" ON public.connected_apps;
DROP POLICY IF EXISTS "Only super_admin can insert connected_apps" ON public.connected_apps;
DROP POLICY IF EXISTS "Only super_admin can update connected_apps" ON public.connected_apps;
DROP POLICY IF EXISTS "Only super_admin can delete connected_apps" ON public.connected_apps;

CREATE POLICY "Authenticated users can view connected_apps"
  ON public.connected_apps FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Only super_admin can insert connected_apps"
  ON public.connected_apps FOR INSERT
  TO authenticated
  WITH CHECK (current_user_hierarchy_level() >= 100);

CREATE POLICY "Only super_admin can update connected_apps"
  ON public.connected_apps FOR UPDATE
  TO authenticated
  USING (current_user_hierarchy_level() >= 100)
  WITH CHECK (current_user_hierarchy_level() >= 100);

CREATE POLICY "Only super_admin can delete connected_apps"
  ON public.connected_apps FOR DELETE
  TO authenticated
  USING (current_user_hierarchy_level() >= 100);

COMMIT;
