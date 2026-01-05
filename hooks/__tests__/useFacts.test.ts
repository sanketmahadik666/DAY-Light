import { renderHook, waitFor } from '@testing-library/react';
import { useFacts } from '../useFacts';
import { getFacts, setFacts } from '@/lib/indexedCache';
import { Fact } from '@/types/fact';

// Mock dependencie
jest.mock('@/lib/indexedCache', () => ({
  getFacts: jest.fn(),
  setFacts: jest.fn(),
}));

jest.mock('@/utils/helpers', () => ({
  getMonthDay: jest.fn(),
}));

// Mock global fetch
global.fetch = jest.fn();

describe('useFacts', () => {
  const date = '2023-01-01';
  const mockFacts: Fact[] = [
    { id: '1', title: 'Fact 1', date: '2023-01-01', category: 'Science' },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    (getFacts as jest.Mock).mockResolvedValue(null);
    (setFacts as jest.Mock).mockResolvedValue(undefined);
  });

  it('should return loading initially', async () => {
    // Return a promise that never resolves for fetch to keep cachedEntry check pending?
    // Actually useFacts is async effects.
    
    // We can't easily test the initial synchronous render state if the effect runs immediately
    // typically renderHook result.current will show initial state
    const { result } = renderHook(() => useFacts(date));
    expect(result.current.loading).toBe(true);
    expect(result.current.facts).toEqual([]);
    
    // Cleanup
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('should load facts from IndexedDB if available', async () => {
    (getFacts as jest.Mock).mockResolvedValue({
      date,
      facts: mockFacts,
      cachedAt: Date.now(),
      ttl: 3600
    });

    const { result } = renderHook(() => useFacts(date));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.facts).toEqual(mockFacts);
    // Should verify it tries to refresh in background? The hook does that.
  });

  it('should fallback to Static JSON if IDB is empty', async () => {
    (getFacts as jest.Mock).mockResolvedValue(null);
    
    // Mock static fetch
    (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ facts: mockFacts }),
        status: 200
    });

    const { result } = renderHook(() => useFacts(date));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.facts).toEqual(mockFacts);
    // Should cache to IDB
    expect(setFacts).toHaveBeenCalledWith(date, mockFacts);
  });
  
  it('should fallback to API if Static JSON fails', async () => {
    (getFacts as jest.Mock).mockResolvedValue(null);
    
    // Mock static fetch fail (404)
    (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404
    });
    
    // Mock API fetch success
    (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ facts: mockFacts }),
        status: 200
    });

    const { result } = renderHook(() => useFacts(date));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.facts).toEqual(mockFacts);
    // Should cache to IDB
    expect(setFacts).toHaveBeenCalledWith(date, mockFacts);
  });
  
   it('should return minimal offline facts if all sources fail', async () => {
    (getFacts as jest.Mock).mockResolvedValue(null);
    
    // Mock static fetch fail
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 404 });
    // Mock API fetch fail
    (global.fetch as jest.Mock).mockRejectedValue(new Error('Network Error'));

    const { result } = renderHook(() => useFacts(date));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.facts).toHaveLength(1);
    expect(result.current.facts[0].id).toBe(`${date}-offline`);
  });
});
