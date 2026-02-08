'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Legacy redirect — /admin now lives at /users */
export default function AdminPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/users');
  }, [router]);
  return null;
}
