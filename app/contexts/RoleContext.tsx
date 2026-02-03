'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from '@supabase/supabase-js';
import { createClient } from '@/app/lib/supabase/client';
import { UserRole, RolePermissions } from '@/app/lib/rbac/types';
import { getPermissions } from '@/app/lib/rbac/permissions';

interface RoleContextType {
  user: User | null;
  role: UserRole | null;
  permissions: RolePermissions | null;
  isLoading: boolean;
  refreshRole: () => Promise<void>;
}

const RoleContext = createContext<RoleContextType>({
  user: null,
  role: null,
  permissions: null,
  isLoading: true,
  refreshRole: async () => {},
});

export function RoleProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [permissions, setPermissions] = useState<RolePermissions | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const supabase = createClient();

  const fetchUserRole = async (userId: string) => {
    const { data, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      return 'viewer' as UserRole;
    }

    return data.role as UserRole;
  };

  const refreshRole = async () => {
    setIsLoading(true);
    try {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();

      if (currentUser) {
        setUser(currentUser);
        const userRole = await fetchUserRole(currentUser.id);
        setRole(userRole);
        setPermissions(getPermissions(userRole));
      } else {
        setUser(null);
        setRole(null);
        setPermissions(null);
      }
    } catch (error) {
      console.error('Error fetching role:', error);
    } finally {
      setIsLoading(false);
    }
  };

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
        setPermissions(null);
        setIsLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return (
    <RoleContext.Provider
      value={{ user, role, permissions, isLoading, refreshRole }}
    >
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  return useContext(RoleContext);
}
