'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import { createClient } from '@/app/lib/supabase/client';
import type { Role, Permission } from '@/app/lib/rbac/types';

interface UserInfo {
  id: string;
  email: string;
}

interface RoleContextType {
  user: UserInfo | null;
  role: Role | null;
  permissions: Permission[];
  isLoading: boolean;
  hasPermission: (app: string, action: string, resource?: string) => boolean;
  refreshRole: () => Promise<void>;
}

const RoleContext = createContext<RoleContextType>({
  user: null,
  role: null,
  permissions: [],
  isLoading: true,
  hasPermission: () => false,
  refreshRole: async () => {},
});

export function RoleProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const supabase = createClient();

  const refreshRole = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/me/permissions');
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        setRole(data.role);
        setPermissions(data.permissions ?? []);
      } else {
        setUser(null);
        setRole(null);
        setPermissions([]);
      }
    } catch {
      // silent — dashboard layout will redirect to login if unauthenticated
    } finally {
      setIsLoading(false);
    }
  }, []);

  const hasPermission = useCallback(
    (app: string, action: string, resource?: string): boolean => {
      if (role?.name === 'super_admin') return true;
      return permissions.some(
        (p) =>
          p.app === app &&
          p.action === action &&
          (resource == null || p.resource === resource)
      );
    },
    [role, permissions]
  );

  useEffect(() => {
    refreshRole();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        refreshRole();
      } else {
        setUser(null);
        setRole(null);
        setPermissions([]);
        setIsLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshRole]);

  return (
    <RoleContext.Provider
      value={{ user, role, permissions, isLoading, hasPermission, refreshRole }}
    >
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  return useContext(RoleContext);
}
