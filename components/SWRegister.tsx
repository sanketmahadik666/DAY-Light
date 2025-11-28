'use client';

import { useEffect } from 'react';
import { registerServiceWorker } from '@/lib/serviceWorker';

export function SWRegister() {
  useEffect(() => {
    if (typeof window !== 'undefined') {
      registerServiceWorker().catch(console.error);
    }
  }, []);

  return null;
}

