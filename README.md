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

## Interesting Techniques

The codebase employs several advanced web techniques for performance and user experience:

### CSS Techniques

- **CSS Scroll Snap**: Used in [GalleryScroller.tsx](components/GalleryScroller.tsx) for smooth, snap-to-slide behavior. The `snap-y snap-mandatory` classes create a full-screen slide experience. See [MDN: CSS Scroll Snap](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Scroll_Snap).
- **CSS Multi-column Layout**: The masonry grid uses `columns-1 sm:columns-2 lg:columns-3 xl:columns-4` with `break-inside-avoid` to create a responsive Pinterest-style layout without JavaScript. See [MDN: CSS Multi-column Layout](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Multicol_Layout).
- **CSS Custom Properties (CSS Variables)**: Theme colors are defined in [app/globals.css](app/globals.css) using CSS variables (`--bg-base`, `--theme-violet`, etc.) for dynamic theming and dark mode support. See [MDN: CSS Custom Properties](https://developer.mozilla.org/en-US/docs/Web/CSS/Using_CSS_custom_properties).
- **Backdrop Filter**: Used for modal overlays with `backdrop-blur-md` for modern glassmorphism effects. See [MDN: backdrop-filter](https://developer.mozilla.org/en-US/docs/Web/CSS/backdrop-filter).
- **Aspect Ratio**: The `aspect-[4/3]` utility in [FactCard.tsx](components/FactCard.tsx) maintains consistent image proportions. See [MDN: aspect-ratio](https://developer.mozilla.org/en-US/docs/Web/CSS/aspect-ratio).

### JavaScript/TypeScript Techniques

- **AbortController**: Used extensively for request cancellation and timeout handling in [useFacts.ts](hooks/useFacts.ts) and [WorkflowGate.tsx](components/WorkflowGate.tsx). See [MDN: AbortController](https://developer.mozilla.org/en-US/docs/Web/API/AbortController).
- **Intersection Observer**: Implicitly used via Framer Motion's `whileInView` in [FactCard.tsx](components/FactCard.tsx) for viewport-based animations. See [MDN: Intersection Observer API](https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API).
- **Passive Event Listeners**: Scroll handlers use `{ passive: true }` in [GalleryScroller.tsx](components/GalleryScroller.tsx) to improve scroll performance. See [MDN: addEventListener](https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/addEventListener#passive).
- **RequestAnimationFrame**: Velocity calculations are throttled using time deltas to avoid jitter during scroll. See [MDN: requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/window/requestAnimationFrame).
- **Structured Cloning**: Deep cloning via `JSON.parse(JSON.stringify())` in [useFacts.ts](hooks/useFacts.ts) to prevent mutation of cached data. See [MDN: Structured Clone Algorithm](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm).
- **useRef for Stale Closures**: The `refreshInBackgroundRef` pattern in [useFacts.ts](hooks/useFacts.ts) avoids stale closure issues in async callbacks. See [React: useRef](https://react.dev/reference/react/useRef).

### Browser APIs

- **IndexedDB**: Client-side database for facts and images with compression, TTL, and LRU eviction in [lib/indexedCache.ts](lib/indexedCache.ts). See [MDN: IndexedDB API](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API).
- **Service Worker**: Offline support and runtime caching via [lib/serviceWorker.ts](lib/serviceWorker.ts). See [MDN: Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API).
- **Storage API**: Storage quota estimation using `navigator.storage.estimate()` in [lib/indexedCache.ts](lib/indexedCache.ts). See [MDN: Storage API](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API).
- **URLSearchParams**: Clean query string construction in API calls. See [MDN: URLSearchParams](https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams).
- **AbortSignal.timeout()**: Modern timeout pattern for fetch requests. See [MDN: AbortSignal.timeout()](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout).

### Performance Optimizations

- **Windowed Rendering**: Only visible slides are rendered in [GalleryScroller.tsx](components/GalleryScroller.tsx), with unmounting of distant slides to free memory.
- **Memoization**: `React.memo` and `useMemo` prevent unnecessary re-renders in [FactSlide.tsx](components/FactSlide.tsx) and [FactCard.tsx](components/FactCard.tsx).
- **Debouncing**: Input validation in [DatePicker.tsx](components/DatePicker.tsx) uses `setTimeout` with cleanup to avoid excessive validation calls.
- **Batched Writes**: IndexedDB writes are batched in [lib/indexedCache.ts](lib/indexedCache.ts) to reduce transaction overhead.
- **Lazy Loading**: Images use `loading="lazy"` attribute for native browser lazy loading. See [MDN: Lazy Loading](https://developer.mozilla.org/en-US/docs/Web/Performance/Lazy_loading_images).

## Technologies & Libraries

### Core Framework

- [**Next.js 14**](https://nextjs.org/) - React framework with App Router, Server Components, and optimized image handling
- [**React 18.3**](https://react.dev/) - UI library with concurrent features and automatic batching
- [**TypeScript 5.3**](https://www.typescriptlang.org/) - Type-safe JavaScript with strict mode

### Styling & Animation

- [**Tailwind CSS 3.4**](https://tailwindcss.com/) - Utility-first CSS framework with custom theme extensions
- [**Framer Motion 11**](https://www.framer.com/motion/) - Production-ready motion library for React with layout animations
- [**PostCSS**](https://postcss.org/) - CSS transformation tool
- [**Autoprefixer**](https://github.com/postcss/autoprefixer) - Automatic vendor prefixing

### Data & Caching

- [**idb 8.0**](https://github.com/jakearchibald/idb) - A tiny wrapper around IndexedDB that makes it more pleasant to use
- [**pako 2.1**](https://github.com/nodeca/pako) - High-speed zlib port to JavaScript for data compression in IndexedDB
- **Service Worker** - Native browser API for offline support and runtime caching

### Data Validation & Utilities

- [**Zod 3.22**](https://zod.dev/) - TypeScript-first schema validation library used in [lib/validators.ts](lib/validators.ts)
- [**date-fns 3.3**](https://date-fns.org/) - Modern JavaScript date utility library for date parsing and formatting

### Testing

- [**Jest 30**](https://jestjs.io/) - JavaScript testing framework
- [**React Testing Library 16**](https://testing-library.com/react) - Simple and complete React DOM testing utilities
- [**MSW 2.12**](https://mswjs.io/) - API mocking library for testing
- [**fake-indexeddb 6.2**](https://github.com/dumbmatter/fakeIndexedDB) - In-memory IndexedDB implementation for testing

### Fonts

- [**Inter**](https://fonts.google.com/specimen/Inter) - Variable font loaded via Next.js font optimization in [app/layout.tsx](app/layout.tsx). The font is configured with `display: 'swap'` for optimal loading performance.

## Project Structure

```
DAY-Light/
├── app/
│   ├── api/
│   │   ├── facts/
│   │   └── normalize-facts/
│   ├── analytics/
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── __tests__/
│   └── analytics/
├── hooks/
│   └── __tests__/
├── lib/
│   ├── __tests__/
│   └── services/
├── public/
│   ├── fallback/
│   ├── static-data/
├── types/
├── utils/
├── Docs/
├── .eslintrc.json
├── .gitignore
├── jest.config.js
├── jest.setup.js
├── next.config.js
├── package.json
├── postcss.config.js
├── tailwind.config.js
└── tsconfig.json
```

### Directory Descriptions

- [**`app/`**](./app): Next.js 14 App Router directory containing pages, layouts, and API routes. The API routes act as proxies to external services with rate limiting and error handling.
- [**`components/`**](./components): React components organized by feature. Components use composition patterns and are optimized with memoization where appropriate.
- [**`hooks/`**](./hooks): Custom React hooks encapsulating data fetching, caching, and state management logic. Hooks follow the multi-layer fallback pattern for robustness.
- [**`lib/`**](./lib): Core libraries and utilities that are framework-agnostic. Includes IndexedDB management, image search algorithms, and data validation.
- [**`public/fallback/`**](./public/fallback): SVG and PNG fallback icons categorized by fact type. These ensure visual consistency even when external images fail to load.
- [**`public/static-data/`**](./public/static-data): Pre-generated JSON files for specific dates, providing offline fallback when IndexedDB and API calls fail.
- [**`types/`**](./types): Centralized TypeScript type definitions ensuring type safety across the application.
- [**`utils/`**](./utils): Pure utility functions for date manipulation, string formatting, and mathematical operations.
- [**`Docs/`**](./Docs): Comprehensive documentation covering architecture decisions, testing strategies, and implementation details.

## Caching Strategy

### IndexedDB

- **Facts**: 24-hour TTL, keyed by date, gzip-compressed
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

| Category   | StaticPhotos Mapping | URL Example                                 |
| ---------- | -------------------- | ------------------------------------------- |
| Birthdays  | `people`             | `https://static.photos/people/1200x630`     |
| Historical | `vintage`            | `https://static.photos/vintage/1200x630`    |
| Science    | `science`            | `https://static.photos/science/1200x630`    |
| Finance    | `finance`            | `https://static.photos/finance/1200x630`    |
| Sports     | `sport`              | `https://static.photos/sport/1200x630`      |
| Festivals  | `event`              | `https://static.photos/event/1200x630`      |
| Space      | `aerial`             | `https://static.photos/aerial/1200x630`     |
| PopCulture | `event`              | `https://static.photos/event/1200x630`      |
| Awards     | `event`              | `https://static.photos/event/1200x630`      |
| Technology | `technology`         | `https://static.photos/technology/1200x630` |

## Image Engine

The image engine searches multiple sources and scores candidates:

- **Wikimedia** (40 points) - Highest authority
- **NASA** (35 points) - For Science/Space categories
- **Wikidata** (25 points) - Structured data
- **Static** (10 points) - Curated images
- **Fallback** (0 points) - Category icons

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
