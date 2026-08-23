'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  ReactNode,
} from 'react';
import { createClient } from '@/app/lib/supabase/client';
import { hasPermission as checkPermission } from '@/app/lib/rbac/permissions';
import type { ConnectedApp, Role, Permission } from '@/app/lib/rbac/types';

interface UserInfo {
  id: string;
  email: string;
}

interface RoleContextType {
  user: UserInfo | null;
  role: Role | null;
  permissions: Permission[];
  apps: ConnectedApp[];
  authError: string | null;
  isLoading: boolean;
  hasPermission: (app: string, action: string, resource?: string) => boolean;
  refreshRole: () => Promise<void>;
  clearSession: () => Promise<void>;
}

const RoleContext = createContext<RoleContextType>({
  user: null,
  role: null,
  permissions: [],
  apps: [],
  authError: null,
  isLoading: true,
  hasPermission: () => false,
  refreshRole: async () => {},
  clearSession: async () => {},
});

export function RoleProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [apps, setApps] = useState<ConnectedApp[]>([]);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const supabase = useMemo(() => createClient(), []);

  const resetAuthState = useCallback((message: string | null = null) => {
    setUser(null);
    setRole(null);
    setPermissions([]);
    setApps([]);
    setAuthError(message);
  }, []);

  const clearSession = useCallback(async () => {
    setIsLoading(true);
    try {
      await supabase.auth.signOut();
      await fetch('/api/auth/signout', {
        method: 'POST',
        credentials: 'same-origin',
      });
    } finally {
      resetAuthState(null);
      setIsLoading(false);
      window.location.assign('/login');
    }
  }, [resetAuthState, supabase]);

  const refreshRole = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/me/permissions', {
        cache: 'no-store',
        credentials: 'same-origin',
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        setRole(data.role);
        setPermissions(data.permissions ?? []);
        setApps(data.apps ?? []);
        setAuthError(null);
        return;
      }

      if (res.status === 401) {
        await clearSession();
        return;
      }

      const payload = await res.json().catch(() => null);
      resetAuthState(
        typeof payload?.error === 'string'
          ? payload.error
          : 'Unable to load your account permissions.'
      );
    } catch {
      resetAuthState('Unable to reach the authentication service.');
    } finally {
      setIsLoading(false);
    }
  }, [clearSession, resetAuthState]);

  // No super_admin short-circuit here. The server's user_has_permission() has no
  // such bypass, so granting one client-side would show controls that the API
  // then rejects. super_admin already resolves every permission through the
  // role_permissions seed; this stays a pure read of what the server returned.
  const hasPermission = useCallback(
    (app: string, action: string, resource?: string): boolean =>
      checkPermission(permissions, app, action, resource),
    [permissions]
  );

  useEffect(() => {
    refreshRole();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      // INITIAL_SESSION fires on subscribe and just replays the session the
      // refreshRole() above already covers. TOKEN_REFRESHED is the same session
      // with a newer access token, so the resolved permissions are unchanged.
      if (event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') return;

      if (session?.user) {
        refreshRole();
      } else {
        resetAuthState(null);
        setIsLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [refreshRole, resetAuthState, supabase]);

  return (
    <RoleContext.Provider
      value={{
        user,
        role,
        permissions,
        apps,
        authError,
        isLoading,
        hasPermission,
        refreshRole,
        clearSession,
      }}
    >
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  return useContext(RoleContext);
}
