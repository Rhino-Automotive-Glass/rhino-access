export type RoleName =
  | 'super_admin'
  | 'admin'
  | 'editor'
  | 'quality_assurance'
  | 'approver'
  | 'viewer';

export type AppName = 'access' | 'origin' | 'code' | 'stock';

export interface Role {
  id: string;
  name: RoleName;
  display_name: string;
  description: string | null;
  hierarchy_level: number;
  is_system: boolean;
}

export interface Permission {
  id?: string;
  app: AppName;
  action: string;
  resource: string | null;
  display_name?: string;
  description?: string | null;
}

export interface UserWithRole {
  id: string;
  email: string;
  role: Role;
  role_id: string;
  role_permission_ids: string[];
  assigned_at: string;
}

export interface UserOverride {
  permission_id: string;
  granted: boolean;
}

// Keep backward compat alias during migration
export type UserRole = RoleName;
