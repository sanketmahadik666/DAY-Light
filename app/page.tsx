'use client';

import { useState, useEffect } from 'react';
import { GalleryShell } from '@/components/GalleryShell';
import { getTodayDateString } from '@/utils/helpers';
import { storage, STORAGE_KEYS } from '@/lib/storage';

export default function Home() {
  const [initialDate, setInitialDate] = useState<string>(getTodayDateString());
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Get last visited date from storage
    const lastDate = storage.get<string>(STORAGE_KEYS.LAST_DATE);
    if (lastDate) {
      setInitialDate(lastDate);
    }
  }, []);

  if (!mounted) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <GalleryShell
      initialDate={initialDate}
      showDatePicker={true}
      enableWorkflow={true}
    />
  );
}

