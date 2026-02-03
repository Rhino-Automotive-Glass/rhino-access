'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useRole } from '@/app/contexts/RoleContext';
import AdminPanel from '@/app/components/AdminPanel';

export default function AdminPage() {
  const { role, isLoading } = useRole();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && role !== 'admin') {
      router.push('/');
    }
  }, [role, isLoading, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-slate-50">
        <div className="bg-white rounded-lg shadow-lg p-8 flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <p className="text-slate-700 font-medium">Checking permissions...</p>
        </div>
      </div>
    );
  }

  if (role !== 'admin') {
    return null;
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-slate-50">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-slate-900">Administration Panel</h1>
          <p className="text-slate-600 mt-2">Manage user roles and permissions</p>
        </div>
        <AdminPanel />
      </div>
    </main>
  );
}
