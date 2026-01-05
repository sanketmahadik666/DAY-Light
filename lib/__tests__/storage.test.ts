import { storage, cookies, version, STORAGE_KEYS, APP_VERSION } from '../storage';

describe('Storage Utils', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
    // Clear cookies
    document.cookie.split(";").forEach(function(c) { 
        document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/"); 
    });
  });

  describe('localStorage', () => {
    it('should set and get values correctly', () => {
      const key = 'test_key';
      const value = { foo: 'bar' };
      
      expect(storage.set(key, value)).toBe(true);
      expect(storage.get(key)).toEqual(value);
    });

    it('should return null for non-existent keys', () => {
      expect(storage.get('non_existent')).toBeNull();
    });

    it('should remove items correctly', () => {
      storage.set('test_key', 'value');
      expect(storage.remove('test_key')).toBe(true);
      expect(storage.get('test_key')).toBeNull();
    });

    it('should clear all items', () => {
      storage.set('key1', 'value1');
      storage.set('key2', 'value2');
      expect(storage.clear()).toBe(true);
      expect(storage.get('key1')).toBeNull();
      expect(storage.get('key2')).toBeNull();
    });

    it('should handle set errors gracefully', () => {
      const mockSetItem = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceeded');
      });
      
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      
      expect(storage.set('key', 'value')).toBe(false);
      expect(consoleSpy).toHaveBeenCalled();
      
      mockSetItem.mockRestore();
      consoleSpy.mockRestore();
    });

     it('should handle get errors gracefully', () => {
      const mockGetItem = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('ReadError');
      });
      
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      
      expect(storage.get('key')).toBeNull();
      expect(consoleSpy).toHaveBeenCalled();
      
      mockGetItem.mockRestore();
      consoleSpy.mockRestore();
    });
  });

  describe('cookies', () => {
    it('should set and get cookies', () => {
      const name = 'test_cookie';
      const value = 'cookie_value';
      
      expect(cookies.set(name, value, 1)).toBe(true);
      expect(cookies.get(name)).toBe(value);
    });

    it('should return null for missing cookies', () => {
      expect(cookies.get('missing_cookie')).toBeNull();
    });

    it('should remove cookies', () => {
      cookies.set('del_cookie', 'value', 1);
      expect(cookies.remove('del_cookie')).toBe(true);
      expect(cookies.get('del_cookie')).toBeNull();
    });
  });

  describe('version', () => {
    it('should get default version', () => {
      expect(version.getCurrent()).toBe(APP_VERSION);
    });

    it('should set and get stored version', () => {
      const newVersion = '2.0.0';
      version.setCurrent(newVersion);
      expect(version.getCurrent()).toBe(newVersion);
    });

    it('should detect update availability', () => {
      expect(version.isUpdateAvailable()).toBe(false);
      
      version.setCurrent('1.0.0'); // older version
      // The logic in isUpdateAvailable compares stored vs APP_VERSION
      // If stored is different, it returns true
      // Wait, isUpdateAvailable uses getCurrent(). 
      // APP_VERSION is '3.0-final' (constant)
      
      // If I set version to something else:
      version.setCurrent('old-version');
      expect(version.isUpdateAvailable()).toBe(true);
      
      // If I set version to current
      version.setCurrent(APP_VERSION);
      expect(version.isUpdateAvailable()).toBe(false);
    });
  });
});
