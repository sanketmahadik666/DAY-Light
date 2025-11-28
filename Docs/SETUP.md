# DAY-LIGHT Setup Guide

## Quick Start

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Create Fallback Icons**
   Place the following icon files in `/public/fallback/`:
   - `person_silhouette.png`
   - `landmark_icon.png`
   - `atom_or_rocket_icon.png`
   - `currency_icon.png`
   - `stadium_or_ball_icon.png`
   - `colorful_event_icon.png`
   - `galaxy_placeholder.png`
   - `music_or_movie_icon.png`
   - `trophy_icon.png`
   - `chip_or_circuit_icon.png`

   These should be simple, recognizable icons (recommended: 200x200px, transparent background).

3. **Run Development Server**
   ```bash
   npm run dev
   ```

4. **Build for Production**
   ```bash
   npm run build
   npm start
   ```

## Key Features Implemented

✅ **Multi-layer Caching**
- IndexedDB with LRU eviction and TTL
- Service Worker with versioned caches
- Static JSON fallbacks

✅ **Image Engine**
- Multi-source fetching (Wikimedia, NASA, Wikidata)
- Intelligent scoring system
- Graceful fallbacks

✅ **Progressive Loading**
- LQIP → thumbnail → hi-res
- Instant fallback icons
- Non-blocking UI

✅ **Accessibility**
- ARIA roles and labels
- Keyboard navigation
- Reduced motion support

✅ **Performance**
- Virtualized scrolling
- Prefetching with backpressure
- Optimized animations

## Next Steps

1. **Add Static Data**: Create JSON files in `/public/static-data/` for offline fallback
2. **Add Fallback Icons**: Create the icon files mentioned above
3. **Test Offline Mode**: Disable network and verify fallbacks work
4. **Optimize Images**: Add image optimization pipeline if needed
5. **Add Analytics**: Track cache hit rates and performance metrics

## Troubleshooting

### Service Worker Not Registering
- Check browser console for errors
- Ensure HTTPS in production (or localhost for development)
- Verify `/public/sw.js` exists

### IndexedDB Errors
- Check browser support (Chrome, Firefox, Safari all support)
- Clear browser data if corruption detected
- Health check runs on app load

### Images Not Loading
- Verify fallback icons exist
- Check CORS on external image sources
- Review image engine logs in console

## Architecture Notes

- **Never blocks UI**: All async operations are non-blocking
- **Graceful degradation**: Multiple fallback layers ensure something always renders
- **Versioned caches**: Easy rollback if issues occur
- **LRU pruning**: Automatic cleanup prevents storage bloat

