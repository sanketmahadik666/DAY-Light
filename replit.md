# DAY-LIGHT v3.0-final

## Overview

DAY-LIGHT is a cinematic, offline-capable, date-based fact gallery built with Next.js 14. Users select a date and browse historical facts presented as full-viewport image slides with text overlays. The app prioritizes fast first paint, offline resilience, and smooth animations across all devices.

Core capabilities:
- Fetch historical facts from Wikimedia OnThisDay API
- Display facts as snap-scrolling gallery slides with background images
- Multi-layer caching (IndexedDB → Service Worker → Static JSON → API)
- Progressive image loading with intelligent fallbacks
- Date picker with single date and date range support
- WCAG AA accessibility with reduced-motion support

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework**: Next.js 14 with App Router, React 18, TypeScript

**Component Hierarchy**:
- `GalleryShell` - Root container managing view modes (date-picker, workflow, gallery), date selection state, and fact loading
- `GalleryScroller` - Virtualized scroll container with snap-scroll behavior
- `FactSlide` - Individual slide with image background and text overlay
- `ImageLayer` - Progressive image loading (fallback → thumbnail → hi-res)
- `FactOverlay` - Text content with expand/collapse functionality
- `DatePicker` / `DateChangeModal` - Date selection UI
- `WorkflowGate` - Sequential validation/processing gates before gallery display

**State Management**: React hooks with context for gallery state. No external state library.

**Styling**: Tailwind CSS with CSS variables for theming. Framer Motion for animations.

### Data Flow

1. User selects date via DatePicker
2. `useFacts` hook fetches facts through fallback chain:
   - IndexedDB cache (instant)
   - Service Worker cache
   - Static JSON files (`/public/static-data/`)
   - API endpoint (`/api/facts`)
3. Facts passed to GalleryScroller → FactSlide components
4. `useImageForFact` hook resolves images through imageEngine

### Caching Strategy

**IndexedDB** (`lib/indexedCache.ts`):
- Facts store: keyed by date, 24-hour TTL
- Images store: metadata with LRU eviction (max 300 entries), 30-day TTL
- Uses `idb` library for promise-based API

**Service Worker** (`public/sw.js`):
- Three caches: static assets, JSON data, images
- LRU pruning for images (max 120)
- Precaches fallback icons
- Never intercepts Next.js internal routes (`/_next/`, `/api/`)

### Image Engine

**Multi-source fetching** (`lib/imageEngine.ts`):
- Wikimedia Commons (primary)
- Wikidata images
- NASA APOD/EPIC
- Category-specific fallback icons

**Scoring system**: Images scored by relevance, size, license. Best candidate selected.

**Progressive loading**: Fallback icon shown instantly → thumbnail → hi-res upgrade

### API Layer

**`/api/facts`**: Proxies Wikimedia OnThisDay API with 2.5s timeout, sanitizes response, converts to Fact schema

**`/api/normalize-facts`**: Worker endpoint for fact cleaning, deduplication, category assignment

### Validation

**Zod schemas** (`lib/validators.ts`): All API responses validated before use. Invalid data filtered out gracefully.

### Error Handling Philosophy

- Never block UI - all async operations have timeouts
- Multiple fallback layers - always show something
- Graceful degradation - partial data better than no data
- Errors logged but not exposed to users

## External Dependencies

### APIs
- **Wikimedia OnThisDay API**: Primary fact source (`api.wikimedia.org/feed/v1/wikipedia/en/onthisday`)
- **Wikimedia Commons API**: Image search
- **Wikidata API**: Entity resolution, person name normalization
- **NASA APIs**: APOD, EPIC for space-related images

### NPM Packages
- `next` (14.x) - React framework
- `react` / `react-dom` (18.x) - UI library
- `framer-motion` (11.x) - Animations
- `idb` (8.x) - IndexedDB wrapper
- `date-fns` (3.x) - Date utilities
- `zod` (3.x) - Schema validation

### Browser APIs
- IndexedDB - Client-side fact/image metadata caching
- Service Worker - Offline support, image binary caching
- localStorage - User preferences (last date, theme)

### Static Assets
- Fallback icons in `/public/fallback/` - SVG icons per category
- Static JSON in `/public/static-data/` - Offline fact fallbacks