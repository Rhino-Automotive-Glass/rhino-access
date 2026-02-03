export type UserRole = 'admin' | 'qa' | 'viewer';

export interface RolePermissions {
  canManageUsers: boolean;
  canViewAuditLogs: boolean;
}

export interface UserWithRole {
  id: string;
  email: string;
  role: UserRole;
  assigned_at: string;
}
