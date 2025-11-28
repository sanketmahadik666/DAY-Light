/**
 * Storage utilities for localStorage, cookies, and key constants
 */

// Storage keys
export const STORAGE_KEYS = {
  LAST_DATE: 'daylight_last_date',
  THEME: 'daylight_theme',
  PREF_CATEGORY: 'daylight_pref_category',
  VERSION: 'daylight_version',
} as const;

export const COOKIE_KEYS = {
  SESSION_RECENT_DATE: 'DL_session_recent_date',
} as const;

export const APP_VERSION = '3.0-final';

/**
 * LocalStorage helpers
 */
export const storage = {
  get<T>(key: string): T | null {
    if (typeof window === 'undefined') return null;
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : null;
    } catch (error) {
      console.error(`Error reading from localStorage key "${key}":`, error);
      return null;
    }
  },

  set<T>(key: string, value: T): boolean {
    if (typeof window === 'undefined') return false;
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error(`Error writing to localStorage key "${key}":`, error);
      return false;
    }
  },

  remove(key: string): boolean {
    if (typeof window === 'undefined') return false;
    try {
      localStorage.removeItem(key);
      return true;
    } catch (error) {
      console.error(`Error removing localStorage key "${key}":`, error);
      return false;
    }
  },

  clear(): boolean {
    if (typeof window === 'undefined') return false;
    try {
      localStorage.clear();
      return true;
    } catch (error) {
      console.error('Error clearing localStorage:', error);
      return false;
    }
  },
};

/**
 * Cookie helpers
 */
export const cookies = {
  get(name: string): string | null {
    if (typeof document === 'undefined') return null;
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) {
      return parts.pop()?.split(';').shift() || null;
    }
    return null;
  },

  set(name: string, value: string, days: number = 7): boolean {
    if (typeof document === 'undefined') return false;
    try {
      const date = new Date();
      date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
      const expires = `expires=${date.toUTCString()}`;
      document.cookie = `${name}=${value};${expires};path=/`;
      return true;
    } catch (error) {
      console.error(`Error setting cookie "${name}":`, error);
      return false;
    }
  },

  remove(name: string): boolean {
    if (typeof document === 'undefined') return false;
    try {
      document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;`;
      return true;
    } catch (error) {
      console.error(`Error removing cookie "${name}":`, error);
      return false;
    }
  },
};

/**
 * Version management
 */
export const version = {
  getCurrent(): string {
    return storage.get<string>(STORAGE_KEYS.VERSION) || APP_VERSION;
  },

  setCurrent(version: string): boolean {
    return storage.set(STORAGE_KEYS.VERSION, version);
  },

  isUpdateAvailable(): boolean {
    const stored = this.getCurrent();
    return stored !== APP_VERSION;
  },
};

