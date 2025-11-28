# DAY-LIGHT Architecture Rules & Guidelines

**Version**: 3.0-final  
**Last Updated**: 2024  
**Status**: MANDATORY REFERENCE FOR ALL CHANGES

---

## Table of Contents

1. [System Architecture Overview](#system-architecture-overview)
2. [Mandatory Robustness Rules](#mandatory-robustness-rules)
3. [Change Management Process](#change-management-process)
4. [File Organization Rules](#file-organization-rules)
5. [Documentation Requirements](#documentation-requirements)
6. [Verification Checklist](#verification-checklist)

---

## System Architecture Overview

### Current Codebase Structure

```
/app
  /api/normalize-facts/route.ts    # Fact normalization worker
  /api/facts/route.ts              # Wikimedia feed proxy with sanitization
  globals.css                       # Global styles
  layout.tsx                        # Root layout with SW registration
  page.tsx                          # Main gallery page

/components
  FactOverlay.tsx                   # Text overlay with expand/collapse
  FactSlide.tsx                     # Individual slide component
  GalleryScroller.tsx               # Scroll container with virtualization
  GalleryShell.tsx                  # Root gallery wrapper, gesture handling
  ImageLayer.tsx                    # Progressive image loading
  SWRegister.tsx                    # Service Worker registration

/hooks
  useEnhancedFacts.ts               # Enhanced facts with normalization
  useFacts.ts                       # Multi-layer fact loading
  useImageForFact.ts                # Progressive image loading

/lib
  apiSanitizer.ts                   # API response sanitization
  dataSources.ts                    # Additional data sources (Wikidata, NASA)
  imageEngine.ts                    # Image search, scoring, selection
  indexedCache.ts                   # IndexedDB utilities with LRU/TTL
  notablePeopleResolver.ts          # Person name normalization
  serviceWorker.ts                  # SW registration and messaging
  storage.ts                        # localStorage and cookies
  validators.ts                     # Zod schemas and validation

/public
  /static-data/YYYY-MM-DD.json      # Static fact fallbacks
  sw.js                             # Service Worker implementation

/types
  fact.ts                           # TypeScript type definitions

/utils
  helpers.ts                        # Text helpers, date formatting, slugs
  math.ts                           # Parallax and animation calculations
```

---

## Mandatory Robustness Rules

### ✅ Core Principles (NEVER VIOLATE)

1. **Never Block UI**
   - All async operations must be non-blocking
   - Always return cached/fallback data instantly
   - Background operations never prevent rendering

2. **Multi-Layer Fallback Chains**

   **Facts Fallback Chain:**
   ```
   IndexedDB (fresh, 24h TTL)
   → SW Runtime Cache (JSON)
   → Static JSON (/static-data/YYYY-MM-DD.json)
   → Minimal offline fact (title only)
   ```

  **Images Fallback Chain (Tiered):**
  ```
  IndexedDB metadata
  → SW Cache (binary)
  → Tier 1: Wikimedia Commons (direct API)
  → Tier 2: NASA Images/APOD (Space only)
  → Tier 3: Openverse Creative Commons search
  → Tier 4: StaticPhotos category fallback (https://static.photos/{mapped}/1200x630)
  → Tier 5: Local SVG fallback icon (/fallback/{category}.svg)
  → Tier 6: Generic default placeholder (/fallback/default-placeholder.png)
  ```

3. **Rate Limit Protection**
   - Detect 429, 503 status codes
   - Check `x-ratelimit-remaining` headers
   - Never retry immediately
   - Use fallback gracefully

4. **Timeout Enforcement**
   - All external API calls: 2-2.5s timeout
   - Use `AbortController` or `AbortSignal.timeout()`
   - Never wait indefinitely

5. **Response Sanitization**
   - ALL external API responses via `apiSanitizer.ts`
   - Validate JSON structure before parsing
   - Check content-type headers
   - Detect HTML error pages
   - Sanitize strings to prevent XSS

6. **Image Pipeline Rules** (`imageEngine.ts`)
   - Validate MIME type (image/* only)
   - Reject files >2MB
   - Check license information
   - Score candidates (authority, match, resolution, aspect, license)
   - Always return fallback icon if no valid image

7. **Service Worker Caching**
   - ONLY cache images (never HTML/JSON in image cache)
   - Validate MIME type before caching
   - Check file size before caching
   - LRU pruning (max 120 images)
   - NEVER intercept Next.js internal routes (`/_next/*`, `/api/*`)

8. **IndexedDB Management**
   - LRU eviction (max 300 image entries)
   - TTL enforcement (facts: 24h, images: 30d)
   - Health checks on app load
   - Graceful corruption recovery (delete specific key, not entire DB)

9. **Accessibility Requirements**
   - ARIA roles and labels
   - Keyboard navigation support
   - Screen reader compatibility
   - `prefers-reduced-motion` support (disable parallax, reduce animations)

10. **Performance Constraints**
    - Virtualized gallery (max 8-10 slides in DOM)
    - Prefetch distance: 2 slides (1 on slow networks)
    - LCP target: < 2.5s
    - TTI target: < 3s
    - Image load: < 700ms cached, < 1500ms network

---

## Change Management Process

### When Adding or Modifying Code

#### Step 1: Identify Files to Change
- List exact file paths
- Verify folder organization (lib/hooks/components/utils)
- Ensure no responsibility overlap

#### Step 2: Use Existing Infrastructure
- Leverage `apiSanitizer.ts` for all external data
- Use `validators.ts` for data validation
- Use `storage.ts` for localStorage/cookies
- Follow patterns in `indexedCache.ts` for caching
- Integrate with `useEnhancedFacts` pipeline

#### Step 3: Maintain Robustness
- Add fallback layers if introducing new data sources
- Implement timeouts for all async operations
- Add error handling with graceful degradation
- Validate all inputs/outputs
- Never eliminate existing fallbacks

#### Step 4: Verify Integration
- Test with SW + IDB + EnhancedFacts pipeline
- Verify no race conditions
- Check for memory leaks in hooks
- Ensure no unbounded prefetching
- Test offline mode

---

## File Organization Rules

### Folder Responsibilities

- **`/app`**: Next.js App Router pages and API routes
- **`/components`**: React UI components (presentation layer)
- **`/hooks`**: Custom React hooks (data fetching, state management)
- **`/lib`**: Core business logic, utilities, integrations
- **`/types`**: TypeScript type definitions
- **`/utils`**: Pure utility functions (no side effects)
- **`/public`**: Static assets, Service Worker, static JSON

### Import Rules

- Use `@/` alias for all internal imports
- Group imports: external → internal → types
- Never import from `node_modules` directly (use package names)

### File Naming

- Components: `PascalCase.tsx`
- Hooks: `camelCase.ts` (prefixed with `use`)
- Utilities: `camelCase.ts`
- Types: `camelCase.ts`

---

## Documentation Requirements

### Required Artifacts for ANY Change

#### 1. CHANGE SUMMARY

Must include:
- **Files Changed**: List all modified/added/deleted files
- **What Changed**: Description of additions/removals/updates
- **Why**: Rationale for the change
- **Weak Points Addressed**: Which robustness issues are fixed
- **Impact Analysis**:
  - Caching impact (IDB, SW)
  - Performance impact
  - Offline mode impact
  - Fallback chain changes

#### 2. UPDATED DOCUMENTATION

Update ONLY relevant sections of:
- `README.md` - Project overview, setup, structure
- `ARCHITECTURE.md` - System architecture (if exists)
- `ROBUSTNESS.md` - Robustness rules and patterns (if exists)
- `DATA_QUALITY.md` - Data quality enhancements
- `HOOKS_REFERENCE.md` - Hook documentation (if exists)
- `SW_CACHING.md` - Service Worker caching strategy (if exists)
- `IMAGE_ENGINE.md` - Image engine documentation (if exists)

Include:
- New workflows
- New fallback chains
- New caching rules
- New environment variables
- New API contracts
- New failure modes and handling

#### 3. NEW FILE DOC-BLOCKS

For any new file, add this header:

```typescript
/**
 * FILE: <relative/path/to/file.ts>
 * PURPOSE: <One-line summary>
 * 
 * KEY RESPONSIBILITIES:
 *   - Responsibility 1
 *   - Responsibility 2
 *   - Responsibility 3
 * 
 * FALLBACKS:
 *   - Fallback layer 1
 *   - Fallback layer 2
 * 
 * ERROR HANDLING:
 *   - Error type 1: How handled
 *   - Error type 2: How handled
 * 
 * CACHING DETAILS:
 *   - What is cached
 *   - TTL/eviction strategy
 *   - Cache key format
 * 
 * INTEGRATION:
 *   - Used by: [list components/hooks]
 *   - Uses: [list dependencies]
 * 
 * ROBUSTNESS GUARANTEES:
 *   - Timeout: X seconds
 *   - Never blocks: Yes/No
 *   - Fallback: Yes/No
 */
```

---

## Verification Checklist

Before finalizing any change, verify:

### Code Quality
- [ ] All imports match folder structure
- [ ] File paths are valid
- [ ] No broken references
- [ ] TypeScript compiles without errors
- [ ] No linter errors

### Architecture Consistency
- [ ] SW + IDB + EnhancedFacts pipeline stays consistent
- [ ] No race conditions introduced
- [ ] No memory leaks in hooks or gestures
- [ ] No unbounded prefetching
- [ ] Virtualization limits respected (max 8-10 slides)

### Robustness
- [ ] All async operations have timeouts
- [ ] All external data is sanitized
- [ ] Fallback chains are maintained
- [ ] Error handling is graceful
- [ ] No UI blocking operations

### Caching
- [ ] IDB TTLs are appropriate
- [ ] SW cache limits are respected
- [ ] LRU pruning is implemented
- [ ] Cache keys follow conventions
- [ ] No HTML/JSON in image cache

### Performance
- [ ] LCP target maintained (< 2.5s)
- [ ] TTI target maintained (< 3s)
- [ ] Image load times acceptable
- [ ] No scroll jank introduced
- [ ] Reduced motion support maintained

### Accessibility
- [ ] ARIA roles and labels present
- [ ] Keyboard navigation works
- [ ] Screen reader compatible
- [ ] Reduced motion honored

---

## Restrictions (NEVER VIOLATE)

1. **NEVER** generate code that touches Next.js internal routing or caches it in SW
2. **NEVER** store raw images in IndexedDB (metadata only)
3. **NEVER** eliminate fallback icons
4. **NEVER** ignore sanitization
5. **NEVER** rewrite entire README unless explicitly asked
6. **NEVER** block UI waiting for network
7. **NEVER** cache HTML/JSON in image cache
8. **NEVER** remove existing fallback layers
9. **NEVER** introduce unbounded operations
10. **NEVER** skip error handling

---

## When in Doubt

If a user request is ambiguous, ask only **HIGH-IMPACT** clarifying questions:

- Does this affect the fallback chain?
- Does this require new caching strategies?
- Does this impact offline mode?
- Does this require new API endpoints?
- Does this affect performance targets?

---

## Final Output Format

Every response MUST contain (in order):

1. **CHANGE SUMMARY** - Complete analysis
2. **UPDATED DOCUMENTATION** - Only relevant sections
3. **FILE DOC BLOCKS** - For any new files
4. **CODE SNIPPETS** - Only if explicitly requested

---

**This document is the authoritative reference for all DAY-LIGHT development work.**

