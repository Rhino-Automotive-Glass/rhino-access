'use client';

import { ROLE_COLORS } from '@/app/lib/rbac/permissions';

interface RoleBadgeProps {
  roleName: string;
  displayName: string;
}

export default function RoleBadge({ roleName, displayName }: RoleBadgeProps) {
  const colorClass = ROLE_COLORS[roleName] ?? 'bg-gray-100 text-gray-800';

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 text-xs font-semibold rounded-full ${colorClass}`}
    >
      {displayName}
    </span>
  );
}
