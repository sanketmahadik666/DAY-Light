# DAY-LIGHT v3.1

A cinematic, offline-capable, date-based fact gallery with reliable caching, strong fallback layers, and smooth UX across all devices. Now featuring a responsive Masonry Grid layout and a soft new visual theme.

## ✨ New in v3.1

- **Masonry Grid Layout**: A Pinterest-style responsive grid view for exploring facts, built with pure CSS columns for maximum performance.
- **Soft & Milky Theme**: A refined "Data-Violet / Light-Pink / Milky" color palette (`#CFDBD1` base, `#F7F8F5` cards, `#1F1A2E` ink) for a calming reading experience.
- **Optimized Performance**:
  - Batched parallel data fetching for date ranges (3x concurrent limit).
  - Debounced input validation for smoother interactions.
  - Zero layout thrashing during scroll via cached metrics.

## Features

- 🎨 **Dual View Modes**: Switch seamlessly between **Cinematic Slides** (Snap-scroll) and **Masonry Grid** (Exploratory).
- 📱 **Offline-First**: IndexedDB + Service Worker caching with multi-layer fallbacks.
- 🖼️ **Progressive Image Loading**: LQIP → thumbnail → hi-res with instant fallbacks.
- ⚡ **Performance Optimized**: LCP < 2.5s, smooth scrolling, zero jank.
- ♿ **Accessible**: WCAG AA compliant with reduced-motion support and proper ARIA management.
- 🎯 **Smart Image Engine**: Multi-source image fetching with intelligent scoring.

## Tech Stack

- **Next.js 14** - React framework with App Router
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling (Extended with custom tokens)
- **Framer Motion** - Animations (Optimized for layout shifts)
- **IndexedDB** - Client-side caching (via idb)
- **Service Worker** - Offline support and image caching

## Getting Started

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Build

```bash
npm run build
npm start
```

## Project Structure

```
/app
  globals.css        # Global styles & Theme Variables
  layout.tsx         # Root layout with SW registration
  page.tsx           # Main gallery page

/components
  GalleryShell.tsx   # State manager: Layout mode, Date selection
  GalleryScroller.tsx # Intelligent container: Slides vs Masonry
  FactCard.tsx       # [NEW] Lightweight grid item for Masonry
  FactSlide.tsx      # Full-screen immersive slide
  ImageLayer.tsx     # Progressive image loading
  ImageGallery.tsx   # Shared modal for exploring extra images

/hooks
  useFactsRange.ts   # [UPDATED] Batched parallel fetching
  useFacts.ts        # Multi-layer fact loading
  useFactImages.ts   # Progressive image loading logic

/lib
  indexedCache.ts    # IndexedDB utilities
  imageEngine.ts     # Image search & scoring
```

## Caching Strategy

### IndexedDB

- **Facts**: 24-hour TTL, keyed by date
- **Images**: 30-day TTL, LRU eviction (max 300 entries)

### Fallback Chain

1.  **IndexedDB** (Instant)
2.  **Service Worker Cache** (Fast)
3.  **API / Tiered Fetching** (Network)
4.  **Static Fallbacks** (Reliable)

## Image Engine

The image engine scores candidates from **Wikimedia**, **NASA**, **Wikidata**, and **Openverse** based on authority, resolution, and relevance, ensuring the best possible visual for every fact.

## Performance Targets

- **LCP**: < 2.5s on mid-tier devices
- **Scroll Jank**: 0ms (Passive listeners + Cached layout)
- **Input Latency**: < 50ms (Debounced validation)

## License

MIT
