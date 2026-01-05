import {
  fetchWikidataData,
  fetchNASAAPOD,
  fetchNASAEPIC,
  fetchGitHubDataset,
  enhanceFactWithAdditionalSources,
} from '../dataSources';
import { Fact } from '@/types/fact';

// Mock global fetch
global.fetch = jest.fn();

describe('DataSources', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('fetchWikidataData', () => {
    it('should return entity data on success', async () => {
      const mockSearchResponse = {
        search: [
          {
            id: 'Q123',
            description: 'Test Description',
            aliases: ['Alias 1'],
          },
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockSearchResponse,
      });

      // Second fetch for entity details (image) - let's make it fail or return empty to simplify first test
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
      });

      const result = await fetchWikidataData('test');
      expect(result).toEqual({
        qid: 'Q123',
        description: 'Test Description',
        aliases: ['Alias 1'],
        imageUrl: undefined,
      });
    });

    it('should return null on fetch failure', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
      });

      const result = await fetchWikidataData('test');
      expect(result).toBeNull();
    });
  });

  describe('fetchNASAAPOD', () => {
      it('should return null if API key is invalid or response not ok', async () => {
          (global.fetch as jest.Mock).mockResolvedValueOnce({
            ok: false,
          });
          const result = await fetchNASAAPOD('2023-01-01');
          expect(result).toBeNull();
      });

      it('should return data if response is valid image', async () => {
          const mockData = {
              title: 'Space Image',
              explanation: 'A nice star',
              url: 'https://nasa.gov/img.jpg',
              hdurl: 'https://nasa.gov/img_hd.jpg',
              media_type: 'image'
          };
          (global.fetch as jest.Mock).mockResolvedValueOnce({
            ok: true,
            json: async () => mockData
          });
          
          const result = await fetchNASAAPOD();
          expect(result).toEqual({
              title: mockData.title,
              explanation: mockData.explanation,
              url: mockData.url,
              hdurl: mockData.hdurl
          });
      });
  });

  describe('enhanceFactWithAdditionalSources', () => {
      it('should return original fact if no enhancement found', async () => {
          const fact: Fact = {
              id: '1',
              title: 'Test Fact',
              date: '2023-01-01',
              category: 'Science'
          };

          // Mock Wikidata failure
          (global.fetch as jest.Mock).mockResolvedValue({
              ok: false
          });

          const result = await enhanceFactWithAdditionalSources(fact);
          expect(result).toEqual(fact);
      });
      
      it('should enhance with Wikidata description', async () => {
          const fact: Fact = {
              id: '1',
              title: 'Test Fact',
              date: '2023-01-01',
              category: 'Science'
          };
          
          const mockSearchResponse = {
            search: [
              {
                id: 'Q123',
                description: 'Enhanced Description',
              },
            ],
          };

          // Mock Wikidata search success
          (global.fetch as jest.Mock).mockResolvedValueOnce({
            ok: true,
            json: async () => mockSearchResponse,
          });
          
          // Mock Wikidata entity details failure (to skip image logic)
          (global.fetch as jest.Mock).mockResolvedValueOnce({
              ok: false
          });

          const result = await enhanceFactWithAdditionalSources(fact);
          expect(result.description).toBe('Enhanced Description');
      });
  });
});
