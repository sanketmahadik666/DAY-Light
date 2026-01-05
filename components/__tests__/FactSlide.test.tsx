import { render, screen } from '@testing-library/react';
import { FactSlide } from '../FactSlide';
import { useImageForFact } from '@/hooks/useImageForFact';
import { Fact } from '@/types/fact';

// Mock dependencie
jest.mock('@/hooks/useImageForFact');
jest.mock('../ImageLayer', () => ({
  ImageLayer: ({ imageUrl }: { imageUrl: string }) => <div data-testid="image-layer">{imageUrl}</div>,
}));
jest.mock('../FactOverlay', () => ({
  FactOverlay: ({ fact }: { fact: Fact }) => <div data-testid="fact-overlay">{fact.title}</div>,
}));

describe('FactSlide', () => {
  const mockFact: Fact = {
    id: '1',
    title: 'Test Fact',
    date: '2023-01-01',
    category: 'Science',
  };

  beforeEach(() => {
    (useImageForFact as jest.Mock).mockReturnValue({
      hiResUrl: 'https://example.com/image.jpg',
      fallbackIcon: '/icons/science.svg',
    });
  });

  it('should render correct content', () => {
    render(<FactSlide fact={mockFact} index={0} isActive={true} />);

    expect(screen.getByTestId('image-layer')).toHaveTextContent('https://example.com/image.jpg');
    expect(screen.getByTestId('fact-overlay')).toHaveTextContent('Test Fact');
  });

  it('should utilize fallback icon if hiResUrl is missing', () => {
    (useImageForFact as jest.Mock).mockReturnValue({
      hiResUrl: null,
      fallbackIcon: '/icons/science.svg',
    });

    render(<FactSlide fact={mockFact} index={0} isActive={true} />);
    
    expect(screen.getByTestId('image-layer')).toHaveTextContent('/icons/science.svg');
  });
});
