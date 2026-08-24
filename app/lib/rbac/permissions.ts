import type { ConnectedApp, Permission } from './types';

/**
 * Check if a permission array contains a specific app+action+resource combo.
 */
export function hasPermission(
  permissions: Permission[],
  app: string,
  action: string,
  resource?: string
): boolean {
  const requestedResource = resource ?? null;

  return permissions.some(
    (p) =>
      p.app === app &&
      p.action === action &&
      p.resource === requestedResource
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

const FALLBACK_COLORS = [
  'bg-blue-500',
  'bg-emerald-500',
  'bg-violet-500',
  'bg-amber-500',
  'bg-cyan-500',
  'bg-rose-500',
  'bg-lime-600',
  'bg-slate-500',
];

function hashString(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function formatAppName(appKey: string) {
  return appKey
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function getFallbackAppMetadata(appKey: string): ConnectedApp {
  const color = FALLBACK_COLORS[hashString(appKey) % FALLBACK_COLORS.length];

  return {
    key: appKey,
    display_name: formatAppName(appKey),
    description: null,
    url: null,
    color,
    sort_order: 999,
    is_active: true,
  };
}

export function getAppMetadata(apps: ConnectedApp[], appKey: string) {
  return apps.find((app) => app.key === appKey) ?? getFallbackAppMetadata(appKey);
}

/**
 * connected_apps.url is stored data, editable by any super_admin. Render it as a
 * link only when it is genuinely http(s): a `javascript:` or `data:` value in an
 * href would execute in the clicking user's session. Returns null when the URL
 * is missing or unusable, so callers can fall back to plain text.
 */
export function safeExternalUrl(url: string | null | undefined): string | null {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function sortApps(apps: ConnectedApp[]) {
  return [...apps].sort((a, b) => {
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return a.display_name.localeCompare(b.display_name);
  });
}
