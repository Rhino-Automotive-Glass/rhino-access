'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { useRole } from '@/app/contexts/RoleContext';
import RoleBadge from '@/app/components/ui/RoleBadge';
import { toast } from '@/app/components/ui/Toast';
import { APP_CONFIG } from '@/app/lib/rbac/permissions';

interface PermissionDef {
  id: string;
  app: string;
  action: string;
  resource: string | null;
  display_name: string;
  description: string | null;
}

interface RoleDef {
  id: string;
  name: string;
  display_name: string;
  hierarchy_level: number;
}

interface UserDetail {
  id: string;
  email: string;
  role_id: string;
  role: RoleDef;
  role_permission_ids: string[];
  assigned_at: string;
  created_at: string;
  is_banned: boolean;
}

export default function UserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: userId } = use(params);
  const { hasPermission, role: myRole, isLoading: authLoading } = useRole();
  const router = useRouter();

  const [userDetail, setUserDetail] = useState<UserDetail | null>(null);
  const [roles, setRoles] = useState<RoleDef[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [allPermissions, setAllPermissions] = useState<PermissionDef[]>([]);
  const [rolePermIds, setRolePermIds] = useState<Set<string>>(new Set());
  const [userOverrides, setUserOverrides] = useState<Map<string, boolean>>(new Map());
  const [saving, setSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !hasPermission('access', 'manage_users')) {
      router.push('/');
    }
  }, [authLoading, hasPermission, router]);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [userRes, rolesRes, permsRes, overridesRes] = await Promise.all([
        fetch(`/api/admin/users/${userId}`),
        fetch('/api/admin/roles'),
        fetch('/api/admin/permissions'),
        fetch(`/api/admin/users/${userId}/permissions`),
      ]);

      if (userRes.ok) {
        const userData: UserDetail = await userRes.json();
        setUserDetail(userData);
        setSelectedRoleId(userData.role_id);
        setRolePermIds(new Set(userData.role_permission_ids));
      }

      if (rolesRes.ok) {
        const data = await rolesRes.json();
        setRoles(data.data);
      }

      if (permsRes.ok) {
        const data = await permsRes.json();
        setAllPermissions(data.data);
      }

      if (overridesRes.ok) {
        const data = await overridesRes.json();
        const map = new Map<string, boolean>();
        (data.data ?? []).forEach(
          (o: { permission_id: string; granted: boolean }) => {
            map.set(o.permission_id, o.granted);
          }
        );
        setUserOverrides(map);
      }
    } catch (err) {
      console.error('Error loading user data:', err);
      toast('error', 'Failed to load user data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRoleChange = async (roleId: string) => {
    setSaving(true);
    const res = await fetch(`/api/admin/users/${userId}/role`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role_id: roleId }),
    });

    if (res.ok) {
      setSelectedRoleId(roleId);
      toast('success', 'Role updated');

      const rpRes = await fetch(`/api/admin/roles/${roleId}/permissions`);
      if (rpRes.ok) {
        const data = await rpRes.json();
        setRolePermIds(
          new Set(data.data.map((p: { permission_id: string }) => p.permission_id))
        );
      }
    } else {
      const err = await res.json();
      toast('error', typeof err.error === 'string' ? err.error : 'Failed to update role');
    }
    setSaving(false);
  };

  const toggleOverride = (permId: string) => {
    const newOverrides = new Map(userOverrides);
    const fromRole = rolePermIds.has(permId);
    const current = newOverrides.get(permId);

    if (current === undefined) {
      newOverrides.set(permId, !fromRole);
    } else {
      newOverrides.delete(permId);
    }
    setUserOverrides(newOverrides);
  };

  const saveOverrides = async () => {
    setSaving(true);
    const grants: string[] = [];
    const revokes: string[] = [];
    userOverrides.forEach((granted, permId) => {
      if (granted) grants.push(permId);
      else revokes.push(permId);
    });

    const res = await fetch(`/api/admin/users/${userId}/permissions`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grants, revokes }),
    });

    if (res.ok) {
      toast('success', 'Permission overrides saved');
    } else {
      toast('error', 'Failed to save permission overrides');
    }
    setSaving(false);
  };

  const permsByApp = allPermissions.reduce(
    (acc, p) => {
      (acc[p.app] ??= []).push(p);
      return acc;
    },
    {} as Record<string, PermissionDef[]>
  );

  const assignableRoles = roles.filter(
    (r) => r.hierarchy_level < (myRole?.hierarchy_level ?? 0)
  );

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-slate-50">
        <div className="bg-white rounded-lg shadow-lg p-8 flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
          <p className="text-slate-700 font-medium">Loading user...</p>
        </div>
      </div>
    );
  }

  if (!userDetail) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-slate-50">
        <div className="container mx-auto px-4 py-8">
          <p className="text-slate-600">User not found.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-slate-50">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 max-w-4xl">
        <button onClick={() => router.push('/users')} className="btn btn-ghost btn-sm mb-4">
          &larr; Back to Users
        </button>

        <div className="flex items-center gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{userDetail.email}</h1>
            <p className="text-sm text-slate-500">
              Joined {new Date(userDetail.created_at).toLocaleDateString()}
            </p>
          </div>
          {userDetail.is_banned && (
            <span className="px-3 py-1 text-xs font-medium rounded-full bg-red-100 text-red-700">
              Deactivated
            </span>
          )}
        </div>

        {/* Role Selector */}
        <div className="card p-6 mb-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-3">Role</h2>
          <div className="flex items-center gap-4">
            <select
              value={selectedRoleId}
              onChange={(e) => handleRoleChange(e.target.value)}
              disabled={saving}
              className="input-base max-w-xs"
            >
              {assignableRoles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.display_name}
                </option>
              ))}
            </select>
            {userDetail.role && (
              <RoleBadge roleName={userDetail.role.name} displayName={userDetail.role.display_name} />
            )}
          </div>
        </div>

        {/* Permission Matrix */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-800">Permissions</h2>
              <p className="text-sm text-slate-500 mt-1">
                Blue = from role. Green/Red = user-specific override.
              </p>
            </div>
            <button onClick={saveOverrides} disabled={saving} className="btn btn-primary btn-sm">
              {saving ? 'Saving...' : 'Save Overrides'}
            </button>
          </div>

          {Object.entries(permsByApp).map(([app, perms]) => {
            const appInfo = APP_CONFIG.find((a) => a.key === app);
            return (
              <div key={app} className="mb-6">
                <div className="flex items-center gap-2 mb-2">
                  {appInfo && <div className={`w-3 h-3 rounded-full ${appInfo.color}`} />}
                  <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wide">
                    {appInfo?.name ?? app}
                  </h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {perms.map((p) => {
                    const fromRole = rolePermIds.has(p.id);
                    const override = userOverrides.get(p.id);
                    const effective = override !== undefined ? override : fromRole;

                    let borderClass = 'border-slate-200';
                    let bgClass = '';
                    if (override !== undefined) {
                      borderClass = override ? 'border-green-300' : 'border-red-300';
                      bgClass = override ? 'bg-green-50' : 'bg-red-50';
                    } else if (fromRole) {
                      borderClass = 'border-blue-200';
                      bgClass = 'bg-blue-50';
                    }

                    return (
                      <label
                        key={p.id}
                        className={`flex items-center gap-3 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${borderClass} ${bgClass}`}
                      >
                        <input
                          type="checkbox"
                          checked={effective}
                          onChange={() => toggleOverride(p.id)}
                          className="h-4 w-4 rounded"
                        />
                        <div className="min-w-0">
                          <span className="text-sm font-medium text-slate-700">
                            {p.display_name}
                          </span>
                          {override !== undefined && (
                            <span
                              className={`ml-2 text-xs ${override ? 'text-green-600' : 'text-red-600'}`}
                            >
                              (override)
                            </span>
                          )}
                          {p.description && (
                            <p className="text-xs text-slate-400 truncate">{p.description}</p>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
