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

### RBAC System (`app/lib/rbac/`)

**Roles** (database-driven, defined in `roles` table):
`super_admin` (100) > `admin` (80) > `editor` (60) > `quality_assurance` (50) > `approver` (40) > `viewer` (10)

Hierarchy level determines who can assign whom — you can only assign roles below your own level.

**Permissions** are fine-grained, per-app actions stored in the `permissions` table:
- Format: `app:action:resource` (e.g. `origin:edit:origin_sheets`, `stock:adjust_inventory:inventory`)
- Assigned to roles via `role_permissions` junction table
- Per-user overrides (grant/deny) via `user_permissions` table
- Deny overrides always win over grants

**Key functions:**
- `apiMiddleware.ts` — `requireAuth()`, `requirePermission(app, action, resource?)`, `requireMinLevel(level)`
- `permissions.ts` — `hasPermission()` helper, `ROLE_COLORS`, `APP_CONFIG`
- `types.ts` — `RoleName`, `AppName`, `Role`, `Permission`, `UserWithRole`

**Client-side:** `RoleContext` (`app/contexts/RoleContext.tsx`) fetches from `/api/me/permissions` and exposes:
- `useRole()` hook → `{ user, role, permissions, isLoading, hasPermission(app, action, resource?), refreshRole() }`

### Database Tables
- `auth.users` — Built-in Supabase auth
- `roles` — Role definitions with hierarchy_level and is_system flag
- `permissions` — Fine-grained permission definitions (app, action, resource)
- `role_permissions` — Junction: which permissions each role gets by default
- `user_permissions` — Per-user overrides (granted boolean for grant/deny)
- `user_roles` — Maps user_id → role_id (one role per user)
- `audit_logs` — Tracks changes (auto-populated by trigger on user_roles)

**Supabase RPC functions** (usable by child apps too):
- `user_has_permission(p_app, p_action, p_resource)` — returns boolean
- `get_user_permissions(p_user_id)` — returns all resolved permissions
- `current_user_hierarchy_level()` — returns int (used in RLS policies)

### Routing
- `(dashboard)/layout.tsx` — Server component that checks auth, wraps with `RoleProvider`, `Header`, `ToastContainer`
- Route groups organize URLs: `(dashboard)/`, `/login`, `/signup`
- Middleware in `proxy.ts` refreshes Supabase sessions on all non-static routes

### Pages
- `/` — Dashboard (user info, permissions summary, quick actions)
- `/users` — User list with search, invite modal
- `/users/[id]` — User detail: role selector + permission matrix with override checkboxes
- `/apps` — Per-app overview (permission counts, user counts)
- `/audit` — Audit log viewer with filtering
- `/admin` — Legacy redirect to `/users`
- `/login`, `/signup` — Public auth pages

### API Routes
- `GET /api/me/permissions` — Current user's role + resolved permissions
- `GET /api/admin/users` — List all users with roles
- `GET /api/admin/users/[userId]` — User detail with role permission IDs
- `PUT /api/admin/users/[userId]/role` — Update user's role (Zod-validated)
- `GET/PUT /api/admin/users/[userId]/permissions` — User-specific permission overrides
- `POST /api/admin/users/invite` — Invite user by email with role
- `GET /api/admin/roles` — List all roles
- `GET /api/admin/roles/[roleId]/permissions` — Role's default permission IDs
- `GET /api/admin/permissions` — List all permission definitions
- `GET /api/admin/apps` — Per-app summary stats
- `GET /api/admin/audit` — Audit log entries

### UI Components
- `components/Header.tsx` — Top nav with permission-gated links + user menu
- `components/ui/Toast.tsx` — Global toast notifications (call `toast(type, message)` from anywhere)
- `components/ui/Modal.tsx` — Reusable modal with escape/overlay-click close
- `components/ui/RoleBadge.tsx` — Color-coded role badge

### Database Migration
- `supabase/migrations/001_expand_rbac.sql` — Full migration for the RBAC expansion (roles, permissions, role_permissions, user_permissions, RLS policies, triggers, RPC functions)

### Path Alias
`@/*` maps to the project root (configured in `tsconfig.json`).

### How Child Apps Check Permissions
All child apps share the same Supabase project. They call the RPC functions directly — no cross-app HTTP needed:
```typescript
const { data: hasAccess } = await supabase.rpc('user_has_permission', {
  p_app: 'origin', p_action: 'edit', p_resource: 'origin_sheets'
});
```
