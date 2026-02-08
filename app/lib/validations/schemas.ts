import { z } from 'zod';

export const roleNameSchema = z.enum([
  'super_admin', 'admin', 'editor', 'quality_assurance', 'approver', 'viewer',
]);

export const updateUserRoleSchema = z.object({
  role_id: z.string().uuid('Invalid role ID'),
});

export const updateUserPermissionsSchema = z.object({
  grants: z.array(z.string().uuid()).default([]),
  revokes: z.array(z.string().uuid()).default([]),
});

export const inviteUserSchema = z.object({
  email: z.string().email('Invalid email address'),
  role_id: z.string().uuid('Invalid role ID'),
});
