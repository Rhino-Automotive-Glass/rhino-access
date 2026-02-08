'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useRole } from '@/app/contexts/RoleContext';
import RoleBadge from '@/app/components/ui/RoleBadge';
import Modal from '@/app/components/ui/Modal';
import { toast } from '@/app/components/ui/Toast';

interface UserRow {
  id: string;
  email: string;
  role_id: string;
  role_name: string;
  role_display_name: string;
  hierarchy_level: number;
  assigned_at: string;
  created_at: string;
  is_banned: boolean;
}

interface RoleDef {
  id: string;
  name: string;
  display_name: string;
  hierarchy_level: number;
}

export default function UsersPage() {
  const { hasPermission, role: myRole, isLoading: authLoading } = useRole();
  const router = useRouter();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<RoleDef[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRoleId, setInviteRoleId] = useState('');
  const [inviting, setInviting] = useState(false);

  useEffect(() => {
    if (!authLoading && !hasPermission('access', 'manage_users')) {
      router.push('/');
    }
  }, [authLoading, hasPermission, router]);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    const [usersRes, rolesRes] = await Promise.all([
      fetch('/api/admin/users'),
      fetch('/api/admin/roles'),
    ]);

    if (usersRes.ok) {
      const data = await usersRes.json();
      setUsers(data.data);
    }
    if (rolesRes.ok) {
      const data = await rolesRes.json();
      setRoles(data.data);
      const assignable = data.data.filter(
        (r: RoleDef) => r.hierarchy_level < (myRole?.hierarchy_level ?? 0)
      );
      if (assignable.length > 0 && !inviteRoleId) {
        setInviteRoleId(assignable[assignable.length - 1].id);
      }
    }
    setIsLoading(false);
  };

  const handleInvite = async () => {
    if (!inviteEmail || !inviteRoleId) return;
    setInviting(true);

    const res = await fetch('/api/admin/users/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: inviteEmail, role_id: inviteRoleId }),
    });

    if (res.ok) {
      toast('success', `Invitation sent to ${inviteEmail}`);
      setInviteOpen(false);
      setInviteEmail('');
      await loadData();
    } else {
      const err = await res.json();
      toast('error', typeof err.error === 'string' ? err.error : 'Failed to invite user');
    }
    setInviting(false);
  };

  const filtered = users.filter(
    (u) =>
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      u.role_display_name.toLowerCase().includes(search.toLowerCase())
  );

  const assignableRoles = roles.filter(
    (r) => r.hierarchy_level < (myRole?.hierarchy_level ?? 0)
  );

  if (authLoading || !hasPermission('access', 'manage_users')) return null;

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-slate-50">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Users</h1>
            <p className="text-slate-600 mt-1">{users.length} users registered</p>
          </div>
          <button
            onClick={() => setInviteOpen(true)}
            className="btn btn-primary btn-md"
          >
            + Invite User
          </button>
        </div>

        <div className="card p-6">
          <div className="mb-4">
            <input
              type="text"
              placeholder="Search by email or role..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-base max-w-sm"
            />
          </div>

          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Email
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Role
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Since
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                        No users found
                      </td>
                    </tr>
                  ) : (
                    filtered.map((u) => (
                      <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 text-sm font-medium text-gray-900">
                          {u.email}
                        </td>
                        <td className="px-6 py-4">
                          <RoleBadge roleName={u.role_name} displayName={u.role_display_name} />
                        </td>
                        <td className="px-6 py-4">
                          {u.is_banned ? (
                            <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-700">
                              Deactivated
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-700">
                              Active
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500">
                          {new Date(u.assigned_at).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => router.push(`/users/${u.id}`)}
                            className="btn btn-ghost btn-sm text-blue-600"
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Invite User Modal */}
      <Modal open={inviteOpen} onClose={() => setInviteOpen(false)} title="Invite User">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Email address
            </label>
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="user@example.com"
              className="input-base"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Assign role
            </label>
            <select
              value={inviteRoleId}
              onChange={(e) => setInviteRoleId(e.target.value)}
              className="input-base"
            >
              {assignableRoles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.display_name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setInviteOpen(false)} className="btn btn-secondary btn-md">
              Cancel
            </button>
            <button
              onClick={handleInvite}
              disabled={inviting || !inviteEmail}
              className="btn btn-primary btn-md"
            >
              {inviting ? 'Sending...' : 'Send Invite'}
            </button>
          </div>
        </div>
      </Modal>
    </main>
  );
}
