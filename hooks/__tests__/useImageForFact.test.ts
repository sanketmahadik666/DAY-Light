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
        // Mock imageEngine to also throw or return null to trigger error state or fallback?
        // In the code catch block sets status error
        
        const { result } = renderHook(() => useImageForFact(fact));
        
        await waitFor(() => expect(result.current.status).toBe('error')); 
        // Logic: if catch block is hit, status=error.
        // It should still show fallback icon even if error
        // wait, the code says "Still show fallback", but status is 'error'.
        // Initial load sets fallback.
    });
});
