'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRole } from '../contexts/RoleContext';
import RoleBadge from './ui/RoleBadge';

const NAV_ITEMS = [
  { href: '/', label: 'Dashboard', permission: null },
  { href: '/users', label: 'Users', permission: { app: 'access', action: 'manage_users' } },
  { href: '/apps', label: 'Apps', permission: { app: 'access', action: 'manage_users' } },
  { href: '/audit', label: 'Audit Log', permission: { app: 'access', action: 'view_audit_logs' } },
];

export default function Header({ onSignOut }: { onSignOut: () => Promise<void> }) {
  const { user, role, hasPermission } = useRole();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const visibleNavItems = NAV_ITEMS.filter(
    (item) =>
      !item.permission ||
      hasPermission(item.permission.app, item.permission.action)
  );

  return (
    <header className="bg-white border-b border-slate-200">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex flex-col">
              <span className="text-lg font-bold text-slate-900">Rhino Access</span>
            </Link>

            <nav className="hidden md:flex items-center gap-1">
              {visibleNavItems.map((item) => {
                const isActive =
                  item.href === '/'
                    ? pathname === '/'
                    : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                      isActive
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          {user && (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-100 transition-colors"
                aria-label="User menu"
              >
                <span className="text-sm text-slate-600 hidden sm:block">
                  {user.email}
                </span>
                {role && (
                  <RoleBadge roleName={role.name} displayName={role.display_name} />
                )}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5 text-slate-600"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M7.5 6a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM3.751 20.105a8.25 8.25 0 0116.498 0 .75.75 0 01-.437.695A18.683 18.683 0 0112 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 01-.437-.695z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>

              {menuOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-50">
                  {/* Mobile nav links */}
                  <div className="md:hidden">
                    {visibleNavItems.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 transition-colors"
                        onClick={() => setMenuOpen(false)}
                      >
                        {item.label}
                      </Link>
                    ))}
                    <hr className="my-1 border-slate-200" />
                  </div>
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      onSignOut();
                    }}
                    className="block w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 transition-colors"
                  >
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
