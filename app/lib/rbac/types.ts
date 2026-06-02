export type RoleName =
  | 'super_admin'
  | 'admin'
  | 'editor'
  | 'quality_assurance'
  | 'approver'
  | 'viewer';

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
  app: string;
  action: string;
  resource: string | null;
  display_name?: string;
  description?: string | null;
}

export interface ConnectedApp {
  key: string;
  display_name: string;
  description: string | null;
  url: string | null;
  color: string;
  sort_order: number;
  is_active: boolean;
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
