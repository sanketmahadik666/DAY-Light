# DAY-LIGHT v3.0-final

A cinematic, offline-capable, date-based fact gallery with reliable caching, strong fallback layers, and smooth UX across all devices.

## Features

- 🎨 **Cinematic Gallery UI**: Full-viewport slides with snap-scroll and parallax
- 📱 **Offline-First**: IndexedDB + Service Worker caching with multi-layer fallbacks
- 🖼️ **Progressive Image Loading**: LQIP → thumbnail → hi-res with instant fallbacks
- ⚡ **Performance Optimized**: LCP < 2.5s, smooth scrolling, zero jank
- ♿ **Accessible**: WCAG AA compliant with reduced-motion support
- 🎯 **Smart Image Engine**: Multi-source image fetching with intelligent scoring

## Tech Stack

- **Next.js 14** - React framework with App Router
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **Framer Motion** - Animations
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
  api/facts/route.ts        # Server-side Wikimedia proxy
  layout.tsx          # Root layout with SW registration
  page.tsx           # Main gallery page
  globals.css        # Global styles

/components
  GalleryShell.tsx   # Root gallery wrapper, gesture handling
  GalleryScroller.tsx # Scroll container with virtualization
  FactSlide.tsx      # Individual slide component
  ImageLayer.tsx     # Progressive image loading
  FactOverlay.tsx    # Text overlay with expand/collapse
  SWRegister.tsx     # Service Worker registration

/hooks
  useFacts.ts        # Multi-layer fact loading (IDB → SW → Static → API)
  useImageForFact.ts # Progressive image loading with fallbacks

/lib
  indexedCache.ts    # IndexedDB utilities with LRU/TTL
  imageEngine.ts     # Image search, scoring, selection
  serviceWorker.ts   # SW registration and messaging
  storage.ts         # localStorage and cookies
  validators.ts      # Zod schemas and validation

/types
  fact.ts            # TypeScript type definitions

/utils
  helpers.ts         # Text helpers, date formatting, slugs
  math.ts            # Parallax and animation calculations
```

## Caching Strategy

### IndexedDB
- **Facts**: 24-hour TTL, keyed by date
- **Images**: 30-day TTL, LRU eviction (max 300 entries)
- **Meta**: Random pool, sync status, version

### Service Worker
- **dl-static-v1**: Static assets and fallback icons
- **dl-json-v1**: JSON fact data
- **dl-images-v1**: Image binaries (max 120, LRU pruning)

### Fallback Chain

**Facts:**
1. IndexedDB (fresh, 24h TTL)
2. SW Runtime Cache
3. Static JSON (`/static-data/YYYY-MM-DD.json`)
4. Minimal offline fact (title only)

**Images (Tiered Pipeline):**
1. **IndexedDB metadata** → return instantly if cached
2. **Service Worker cache** (binary)
3. **Tier 1**: Wikimedia Commons (direct API, sanitized URLs)
4. **Tier 2**: NASA Images / APOD (Space category)
5. **Tier 3**: Openverse Creative Commons search
6. **Tier 4**: StaticPhotos category fallback (`https://static.photos/{mapped}/1200x630`)
7. **Tier 5**: Local SVG fallback icon (`/fallback/{category}.svg`)
8. **Tier 6**: Generic default placeholder (`/fallback/default-placeholder.png`)

| Category    | StaticPhotos Mapping | URL Example                          |
|-------------|----------------------|--------------------------------------|
| Birthdays   | `people`             | `https://static.photos/people/1200x630` |
| Historical  | `vintage`            | `https://static.photos/vintage/1200x630` |
| Science     | `science`            | `https://static.photos/science/1200x630` |
| Finance     | `finance`            | `https://static.photos/finance/1200x630` |
| Sports      | `sport`              | `https://static.photos/sport/1200x630` |
| Festivals   | `event`              | `https://static.photos/event/1200x630` |
| Space       | `aerial`             | `https://static.photos/aerial/1200x630` |
| PopCulture  | `event`              | `https://static.photos/event/1200x630` |
| Awards      | `event`              | `https://static.photos/event/1200x630` |
| Technology  | `technology`         | `https://static.photos/technology/1200x630` |

## Image Engine

The image engine searches multiple sources and scores candidates:

- **Wikimedia** (40 points) - Highest authority
- **NASA** (35 points) - For Science/Space categories
- **Wikidata** (25 points) - Structured data
- **Static** (10 points) - Curated images
- **Fallback** (0 points) - Category icons

Scoring factors: source authority, exact match, resolution (400-1200px preferred), aspect ratio (landscape preferred), license (CC/Public Domain required).

## Performance Targets

- **LCP**: < 2.5s on mid-tier devices
- **TTI**: < 3s
- **Image Load**: < 700ms cached, < 1500ms network
- **Scroll Jank**: 0-1ms main thread blocks

## Accessibility

- ARIA roles and labels
- Keyboard navigation (arrows, space, esc)
- Screen reader support
- Reduced motion support (`prefers-reduced-motion`)
- Semantic HTML

## License

MIT
