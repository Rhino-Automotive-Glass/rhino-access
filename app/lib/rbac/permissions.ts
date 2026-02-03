import { UserRole, RolePermissions } from './types';

export const ROLE_PERMISSIONS: Record<UserRole, RolePermissions> = {
  admin: {
    canManageUsers: true,
    canViewAuditLogs: true,
  },
  qa: {
    canManageUsers: false,
    canViewAuditLogs: false,
  },
  viewer: {
    canManageUsers: false,
    canViewAuditLogs: false,
  },
};

export function getPermissions(role: UserRole): RolePermissions {
  return ROLE_PERMISSIONS[role];
}

export function canPerformAction(
  role: UserRole,
  action: keyof RolePermissions
): boolean {
  return ROLE_PERMISSIONS[role][action];
}
