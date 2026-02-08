# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Rhino Access is the centralized User & Permission Management hub for the Rhino app ecosystem. It manages users, roles, and fine-grained permissions across 4 apps sharing a single Supabase project:

- **Rhino Access** (this app) — admin hub at rhino-access.vercel.app
- **Rhino Origin** — origin sheets/formats at rhino-origin.vercel.app
- **Rhino Code** — product codes/descriptions at rhino-product-code-description.vercel.app
- **Rhino Stock** — inventory at rhino-stock.vercel.app

## Commands

- `npm run dev` — Start development server (port 3000)
- `npm run build` — Production build
- `npm start` — Start production server
- `npm run lint` — Run ESLint

No test framework is configured.

## Environment Variables

Copy `.env.local.example` to `.env.local`. Required values from Supabase dashboard:
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase publishable anon key
- `SUPABASE_SERVICE_ROLE_KEY` — Service role key (server-only, bypasses RLS)
- `NEXT_PUBLIC_SITE_URL` — Site URL for email redirects (auto-set on Vercel via `VERCEL_URL`)

## Architecture

### Tech Stack
- **Framework**: Next.js 16 with App Router, React 19, TypeScript
- **Backend/Auth/DB**: Supabase (PostgreSQL + Auth + PostgREST)
- **Styling**: Tailwind CSS v4 with custom utility classes in `app/globals.css`
- **Validation**: Zod schemas in `app/lib/validations/schemas.ts`

### Supabase Clients (`app/lib/supabase/`)
Three Supabase client variants used depending on context:
- `client.ts` — Browser-side client (uses public anon key, respects RLS)
- `server.ts` — Server-side client (manages cookies for session persistence)
- `admin.ts` — Admin client (uses service role key, bypasses RLS; server-only for `auth.admin.*` calls)

### Authentication (`app/lib/auth/`)
- `actions.ts` — Server actions (`'use server'`) for `signIn`, `signUp`, `signOut`
- `constants.ts` — Route paths and error message constants
- OAuth callback at `app/api/auth/callback/route.ts`
- `redirect()` throws `NEXT_REDIRECT` internally — do NOT wrap server action calls in try/catch or it will flash an error before the redirect completes

### Supabase TypeScript Gotcha
When using `.select('roles(hierarchy_level)')` (joined/embedded selects), Supabase returns the joined field typed as an array. To cast to a single object, use `as unknown as { hierarchy_level: number } | null` — a direct `as` cast causes TS errors because the types don't overlap.

---

## RBAC System — How Roles & Permissions Work

### Overview

The RBAC system has three layers:
1. **Roles** — every user has exactly one role (stored in `user_roles`)
2. **Role permissions** — each role has a default set of permissions (stored in `role_permissions`)
3. **User overrides** — individual users can be granted or denied specific permissions beyond their role (stored in `user_permissions`)

When resolving a user's effective permissions: `(role_permissions UNION user_grants) MINUS user_denies`. Deny always wins.

### Roles & Hierarchy

Roles are database-driven (not hardcoded). Defined in the `roles` table with a `hierarchy_level`:

| Role | Level | Description |
|------|-------|-------------|
| `super_admin` | 100 | Full system access. Can manage roles, permissions, and all users. |
| `admin` | 80 | Can manage users and most settings. Cannot manage role/permission definitions. |
| `editor` | 60 | Can create and edit content across all child apps. |
| `quality_assurance` | 50 | Can review, approve/reject, and flag items. |
| `approver` | 40 | Can approve submissions and changes. |
| `viewer` | 10 | Read-only access to child apps. Default for new users. |

**Hierarchy enforcement:**
- You can only assign roles with a level **below** your own (admin at 80 cannot assign super_admin at 100)
- You can only delete users with a level **below** your own
- You cannot change your own role or delete yourself
- RLS policies enforce this at the database level via `current_user_hierarchy_level()`
- API routes also validate hierarchy before mutations

### Permissions

Permissions are fine-grained, per-app actions stored in the `permissions` table with three columns:
- `app` — which app (`access`, `origin`, `code`, `stock`)
- `action` — what operation (`view`, `create`, `edit`, `delete`, `approve`, `manage_users`, etc.)
- `resource` — optional sub-resource (`origin_sheets`, `product_codes`, `inventory`)

Current permissions seeded by the migration:

**Rhino Access** (this app):
`manage_users`, `manage_roles`, `manage_permissions`, `view_audit_logs`

**Rhino Origin**: `view`, `create`, `edit`, `delete`, `approve` on `origin_sheets`

**Rhino Code**: `view`, `create`, `edit`, `delete` on `product_codes`

**Rhino Stock**: `view`, `create`, `delete`, `adjust_inventory` on `inventory`

### Default Role Permissions (seeded in migration)

| Role | Gets |
|------|------|
| `super_admin` | All permissions across all apps |
| `admin` | Everything except `manage_roles` and `manage_permissions` |
| `editor` | `view`, `create`, `edit` across all child apps (no access app perms) |
| `quality_assurance` | `view`, `approve` across all child apps |
| `approver` | `view`, `approve` across all child apps |
| `viewer` | `view` only across all child apps |

### User-Specific Overrides

On the `/users/[id]` page, admins can grant or deny individual permissions beyond the user's role:
- **Grant** (green) — gives a permission the role doesn't include
- **Deny** (red) — revokes a permission the role normally includes
- Overrides are stored in `user_permissions` with `granted: true/false`
- Deny always wins over both role grants and user grants

### How Permission Checks Work

**Server-side (API routes):**
```typescript
// Check a specific permission
const result = await requirePermission(request, 'access', 'manage_users');
if (result instanceof NextResponse) return result; // 401 or 403

// Check minimum hierarchy level
const result = await requireMinLevel(request, 80);
if (result instanceof NextResponse) return result;
```

**Client-side (React components):**
```typescript
const { hasPermission, role } = useRole();
if (hasPermission('origin', 'edit', 'origin_sheets')) { /* show edit UI */ }
```

**Child apps (same Supabase project, no HTTP needed):**
```typescript
// Check single permission
const { data: canEdit } = await supabase.rpc('user_has_permission', {
  p_app: 'origin', p_action: 'edit', p_resource: 'origin_sheets'
});

// Get all permissions at once
const { data: perms } = await supabase.rpc('get_user_permissions', {
  p_user_id: user.id
});
```

### New User Flow

1. Admin invites user via `/users` page → calls `POST /api/admin/users/invite`
2. Supabase sends invite email via `adminClient.auth.admin.inviteUserByEmail()`
3. User's role is assigned immediately in `user_roles`
4. If a user signs up directly (not invited), the `on_auth_user_created` trigger auto-assigns `viewer` role

### User Deletion

- `DELETE /api/admin/users/[userId]` permanently removes a user
- Cleans up `user_permissions` and `user_roles` before deleting from `auth.users`
- Protected by hierarchy check — cannot delete users at or above your own level
- Cannot delete yourself

---

## Database

### Tables

| Table | Purpose |
|-------|---------|
| `auth.users` | Built-in Supabase auth users |
| `roles` | Role definitions (name, display_name, hierarchy_level, is_system) |
| `permissions` | Permission definitions (app, action, resource, display_name) |
| `role_permissions` | Junction: default permissions per role |
| `user_permissions` | Per-user overrides (granted boolean for grant/deny) |
| `user_roles` | Maps user_id → role_id (one role per user, UNIQUE on user_id) |
| `audit_logs` | Tracks changes (id, user_id, user_email, action, resource_type, resource_id, old_data, new_data, ip_address, user_agent, created_at) |

### RPC Functions (usable by all apps)
- `user_has_permission(p_app, p_action, p_resource)` — returns boolean for current auth user
- `get_user_permissions(p_user_id)` — returns table of (app, action, resource) for a user
- `current_user_hierarchy_level()` — returns int for current auth user (used in RLS policies)

### Triggers
- `on_auth_user_created` on `auth.users` — auto-assigns `viewer` role to new users
- `audit_user_role_changes` on `user_roles` — logs role changes to `audit_logs`
- `set_roles_updated_at` / `set_user_roles_updated_at` — auto-updates `updated_at`

### RLS Policy Summary
- `roles` / `permissions` — all authenticated can read; only super_admin (level 100) can modify
- `role_permissions` — admin+ (level 80) can read; only super_admin can modify
- `user_roles` — users can read their own; admin+ can read all; admin+ can insert/update with hierarchy check
- `user_permissions` — users can read their own; admin+ can read/manage all
- `audit_logs` — admin+ can read (policy recreated by migration to use new schema)
- `product_codes` — admin+ can create/update/delete; QA+ (level 50) can toggle verified

### Migration
- `supabase/migrations/001_expand_rbac.sql` — Full migration file. Run in Supabase SQL editor.
- The migration handles: creating new tables, seeding roles/permissions/role_permissions, migrating `user_roles` from varchar `role` to FK `role_id`, dropping and recreating dependent RLS policies on `audit_logs` and `product_codes`, adding RPC functions, triggers, and RLS policies.
- After running the migration, promote yourself to super_admin:
  ```sql
  UPDATE public.user_roles
  SET role_id = (SELECT id FROM public.roles WHERE name = 'super_admin'),
      assigned_by = user_id
  WHERE user_id = (SELECT id FROM auth.users WHERE email = 'your@email.com');
  ```

---

## Routing & Pages

| Route | Access | Description |
|-------|--------|-------------|
| `/login` | Public | Email/password login |
| `/signup` | Public | Account registration |
| `/` | Authenticated | Dashboard — user info, permission summary, quick actions |
| `/users` | `manage_users` | User list with search, invite modal, remove button |
| `/users/[id]` | `manage_users` | User detail: role selector, permission matrix, remove |
| `/apps` | `manage_users` | Per-app overview (permission and user counts) |
| `/audit` | `view_audit_logs` | Audit log viewer with filtering |
| `/admin` | Any | Legacy redirect to `/users` |

### API Routes

| Method | Route | Guard | Description |
|--------|-------|-------|-------------|
| GET | `/api/me/permissions` | `requireAuth` | Current user's role + resolved permissions |
| GET | `/api/admin/users` | `manage_users` | List all users with roles |
| GET | `/api/admin/users/[userId]` | `manage_users` | User detail with role permission IDs |
| DELETE | `/api/admin/users/[userId]` | `requireMinLevel(80)` + hierarchy check | Permanently remove user |
| PUT | `/api/admin/users/[userId]/role` | `manage_users` + hierarchy check | Update user's role |
| GET/PUT | `/api/admin/users/[userId]/permissions` | `manage_permissions` | User-specific permission overrides |
| POST | `/api/admin/users/invite` | `manage_users` + hierarchy check | Invite user by email with role |
| GET | `/api/admin/roles` | `requireAuth` | List all roles |
| GET | `/api/admin/roles/[roleId]/permissions` | `manage_users` | Role's default permission IDs |
| GET | `/api/admin/permissions` | `requireAuth` | List all permission definitions |
| GET | `/api/admin/apps` | `manage_users` | Per-app summary stats |
| GET | `/api/admin/audit` | `view_audit_logs` | Audit log entries |

---

## UI Components

- `components/Header.tsx` — Top nav with permission-gated links (Dashboard, Users, Apps, Audit), active state, user menu with RoleBadge
- `components/ui/Toast.tsx` — Global toast system. Import `toast('success' | 'error' | 'info', message)` from anywhere.
- `components/ui/Modal.tsx` — Reusable modal with escape key + overlay click to close
- `components/ui/RoleBadge.tsx` — Color-coded badge using `ROLE_COLORS` from permissions.ts

### Path Alias
`@/*` maps to the project root (configured in `tsconfig.json`).
