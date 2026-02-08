import type { Permission } from './types';

/**
 * Check if a permission array contains a specific app+action+resource combo.
 */
export function hasPermission(
  permissions: Permission[],
  app: string,
  action: string,
  resource?: string
): boolean {
  return permissions.some(
    (p) =>
      p.app === app &&
      p.action === action &&
      (resource == null || p.resource === resource)
  );
}

/** Role badge color mapping */
export const ROLE_COLORS: Record<string, string> = {
  super_admin: 'bg-red-100 text-red-800',
  admin: 'bg-purple-100 text-purple-800',
  editor: 'bg-indigo-100 text-indigo-800',
  quality_assurance: 'bg-blue-100 text-blue-800',
  approver: 'bg-teal-100 text-teal-800',
  viewer: 'bg-gray-100 text-gray-800',
};

/** App display config */
export const APP_CONFIG = [
  { key: 'access', name: 'Rhino Access', url: 'https://rhino-access.vercel.app', color: 'bg-blue-500' },
  { key: 'origin', name: 'Rhino Origin', url: 'https://rhino-origin.vercel.app', color: 'bg-emerald-500' },
  { key: 'code', name: 'Rhino Code', url: 'https://rhino-product-code-description.vercel.app', color: 'bg-violet-500' },
  { key: 'stock', name: 'Rhino Stock', url: 'https://rhino-stock.vercel.app', color: 'bg-amber-500' },
] as const;
