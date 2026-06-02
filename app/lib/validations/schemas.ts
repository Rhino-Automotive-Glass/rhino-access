import { z } from 'zod';

export const roleNameSchema = z.enum([
  'super_admin', 'admin', 'editor', 'quality_assurance', 'approver', 'viewer',
]);

export const updateUserRoleSchema = z.object({
  role_id: z.string().uuid('Invalid role ID'),
});

const permissionIdArraySchema = z.array(z.string().uuid());

function findDuplicate(values: string[]) {
  const seen = new Set<string>();
  return values.find((value) => {
    if (seen.has(value)) return true;
    seen.add(value);
    return false;
  });
}

export const updateUserPermissionsSchema = z
  .object({
    grants: permissionIdArraySchema.default([]),
    revokes: permissionIdArraySchema.default([]),
  })
  .superRefine(({ grants, revokes }, ctx) => {
    const duplicateGrant = findDuplicate(grants);
    if (duplicateGrant) {
      ctx.addIssue({
        code: 'custom',
        path: ['grants'],
        message: 'Duplicate grant permission IDs are not allowed',
      });
    }

    const duplicateRevoke = findDuplicate(revokes);
    if (duplicateRevoke) {
      ctx.addIssue({
        code: 'custom',
        path: ['revokes'],
        message: 'Duplicate revoke permission IDs are not allowed',
      });
    }

    const revokeSet = new Set(revokes);
    if (grants.some((permissionId) => revokeSet.has(permissionId))) {
      ctx.addIssue({
        code: 'custom',
        message: 'A permission cannot be both granted and revoked',
      });
    }
  });

export const inviteUserSchema = z.object({
  email: z.string().email('Invalid email address'),
  role_id: z.string().uuid('Invalid role ID'),
});
