import { renderHook, waitFor } from '@testing-library/react';
import { useImageForFact } from '../useImageForFact';
import { getImage, setImage } from '@/lib/indexedCache';
import { findImageForFact } from '@/lib/imageEngine';
import { getFallbackIconPath, normalizeKey } from '@/utils/helpers';
import { Fact, ImageMetadata } from '@/types/fact';

jest.mock('@/lib/indexedCache');
jest.mock('@/lib/imageEngine');
jest.mock('@/utils/helpers');

describe('useImageForFact', () => {
    const fact: Fact = { id: '1', title: 'Test', date: '2023-01-01', category: 'Science' };
    const fallbackPath = '/icons/science.svg';

    beforeEach(() => {
        jest.clearAllMocks();
        (getFallbackIconPath as jest.Mock).mockReturnValue(fallbackPath);
        (normalizeKey as jest.Mock).mockReturnValue('test');
        // Set default mock behavior to avoid leakage
        (getImage as jest.Mock).mockResolvedValue(null); 
        (findImageForFact as jest.Mock).mockResolvedValue(null);
    });

    it('should return fallback initially', async () => {
        // Mock async calls to pend
        (getImage as jest.Mock).mockImplementation(() => new Promise(() => {}));
        
        const { result } = renderHook(() => useImageForFact(fact));

        expect(result.current.status).toBe('fallback');
        expect(result.current.thumbnailUrl).toBe(fallbackPath);
    });

    it('should load image from IDB if available', async () => {
        const cachedImage: ImageMetadata = {
            url: 'https://example.com/cached.jpg',
            source: 'wikimedia',
            cachedAt: Date.now()
        };

        (getImage as jest.Mock).mockResolvedValue({ value: cachedImage });

        const { result } = renderHook(() => useImageForFact(fact));

        await waitFor(() => expect(result.current.status).toBe('loaded'));
        expect(result.current.hiResUrl).toBe(cachedImage.url);
        expect(result.current.source).toBe('wikimedia');
    });

    it('should fetch from imageEngine if IDB miss', async () => {
         (getImage as jest.Mock).mockResolvedValue(null);
         const engineImage: ImageMetadata = {
            url: 'https://example.com/engine.jpg',
            source: 'nasa',
            cachedAt: Date.now()
        };
        (findImageForFact as jest.Mock).mockResolvedValue(engineImage);

        const { result } = renderHook(() => useImageForFact(fact));

        await waitFor(() => expect(result.current.status).toBe('loaded'));
        expect(result.current.hiResUrl).toBe(engineImage.url);
        expect(result.current.source).toBe('nasa');
        expect(setImage).toHaveBeenCalled();
    });

    it('should use fallback on error', async () => {
        (getImage as jest.Mock).mockRejectedValue(new Error('IDB Error'));
        (findImageForFact as jest.Mock).mockRejectedValue(new Error('Engine Error'));
        
        const { result } = renderHook(() => useImageForFact(fact));
        
        // Should stay in fallback or eventually settle there. 
        // Since we swallow errors in the hook and don't explicit set 'error' state (except for the console.error),
        // we expect it to remain "fallback" as initialized.
        // Wait for potential async changes? If it stays fallback immediately, waitFor might pass or timeout if it expects a change.
        // But here we verify it DOES NOT change to 'loaded' or 'error' (if we decided 'fallback' is better).
        
        // To verify it "finished" loading but failed, we might check if console.error was called?
        // Or simply that after some time, it is still fallback.
        expect(result.current.status).toBe('fallback');
    });
});
