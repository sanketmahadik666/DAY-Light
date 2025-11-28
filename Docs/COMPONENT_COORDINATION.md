# Component Coordination Summary

**Date**: 2025-01-27  
**Version**: 3.0-final  
**Status**: ✅ **ALL COMPONENTS COORDINATED**

---

## Component Flow Diagram

```
User Action: Click "Change Date" Button
    ↓
GalleryShell.handleChangeDateFromGallery()
    ↓
DateChangeModal opens (z-index: 100)
    ↓
User selects date in DatePicker
    ↓
User clicks "Confirm & Load Facts"
    ↓
DateChangeModal.handleConfirm()
    ↓
GalleryShell.handleDateSelectFromModal()
    ├─ Closes modal
    ├─ Resets currentIndex to 0
    ├─ Updates dateSelection state
    ├─ Updates currentDate state
    ├─ Forces GalleryScroller remount (galleryKey++)
    └─ Sets viewMode to 'workflow' or 'gallery'
        ↓
    If workflow enabled:
        ↓
    WorkflowGate auto-executes
        ├─ Detects selection change
        ├─ Resets execution state
        └─ Executes gates sequentially
            ↓
        WorkflowGate.onComplete()
            ↓
        GalleryShell.handleWorkflowComplete()
            ↓
        Sets viewMode to 'gallery'
            ↓
    GalleryShell renders gallery view
        ├─ useFacts(singleDate) or useFactsRange(dateSelection)
        ├─ Facts load from IDB → SW → Static → API
        └─ GalleryScroller renders slides
            ↓
    FactSlide components render
        ├─ useImageForFact(fact) loads images
        └─ ImageLayer displays images with fallbacks
```

---

## Component Responsibilities

### 1. **GalleryShell.tsx** (Main Orchestrator)
- **State Management**:
  - `viewMode`: Controls which view to show ('date-picker' | 'workflow' | 'gallery')
  - `dateSelection`: Current date selection from user
  - `currentDate`: Active date for fact loading
  - `currentIndex`: Current slide index
  - `galleryKey`: Force remount key for GalleryScroller
  - `isDateModalOpen`: Modal visibility state

- **Key Functions**:
  - `handleChangeDateFromGallery()`: Opens modal
  - `handleDateSelectFromModal()`: Processes date selection, triggers workflow/gallery
  - `handleWorkflowComplete()`: Transitions from workflow to gallery

- **Coordination Points**:
  - Uses `useFacts` or `useFactsRange` based on selection mode
  - Passes `galleryKey` to GalleryScroller for remounting
  - Manages z-index layering (button: z-60, gallery: z-50, modal: z-100)

### 2. **DateChangeModal.tsx** (Modal Popup)
- **State Management**:
  - `selectedDate`: Currently selected date in picker
  - `isValid`: Validation state from DatePicker
  - `tempSelection`: Temporary selection before confirmation

- **Key Functions**:
  - `handleDatePickerChange()`: Updates temp selection (doesn't trigger reload)
  - `handleConfirm()`: Only then calls `onDateSelect()` to trigger reload

- **Coordination Points**:
  - Resets state when modal opens
  - Only triggers date change on "Confirm" button click
  - Prevents body scroll when open
  - Handles ESC key to close

### 3. **DatePicker.tsx** (Date Selection UI)
- **State Management**:
  - `singleDate`, `startDate`, `endDate`: Date values
  - `selectionMode`: 'single' or 'range'
  - `errors`: Validation errors

- **Key Functions**:
  - `emitSelection()`: Auto-emits on every date change
  - `validateSingleDate()` / `validateDateRange()`: Validates dates

- **Coordination Points**:
  - Syncs with `initialDate` prop changes
  - Auto-emits selection (parent should handle appropriately)
  - In modal context, parent uses `onValidationChange` to track validity

### 4. **WorkflowGate.tsx** (Workflow Execution)
- **State Management**:
  - `executionState`: Current execution state
  - `prevSelectionRef`: Tracks previous selection to detect changes

- **Key Functions**:
  - `executeWorkflow()`: Runs gates sequentially
  - `executeGate()`: Executes individual gate

- **Coordination Points**:
  - Auto-executes on mount
  - Re-executes when selection changes (detected via ref)
  - Resets state when new selection detected
  - Calls `onComplete()` when done

### 5. **GalleryScroller.tsx** (Gallery Container)
- **State Management**:
  - `visibleRange`: Which slides to render (virtualization)
  - `prevSlidesLengthRef`: Tracks slide count changes

- **Key Functions**:
  - Scroll handler: Updates currentIndex on scroll
  - Scroll to index: Uses instant scroll when slides change

- **Coordination Points**:
  - Receives `key={galleryKey}` prop for remounting
  - Uses instant scroll (`behavior: 'auto'`) when slides array changes
  - Only renders visible slides + prefetch range

### 6. **FactSlide.tsx** (Individual Slide)
- **State Management**:
  - `isExpanded`: Overlay expansion state

- **Key Functions**:
  - Uses `useImageForFact()` to get image URL
  - Renders ImageLayer and FactOverlay

- **Coordination Points**:
  - z-index: 1 (below button and modal)
  - Fast transition (0.2s) to prevent overlap
  - Proper stacking context

### 7. **useFacts.ts** (Single Date Facts Hook)
- **Coordination Points**:
  - Reloads when `date` prop changes
  - Multi-layer fallback: IDB → SW → Static → API
  - Returns `facts`, `loading`, `error`

### 8. **useFactsRange.ts** (Date Range Facts Hook)
- **Coordination Points**:
  - Reloads when `selection` prop changes
  - Fetches facts for each date in range
  - Aggregates all facts into single array
  - Returns `facts`, `loading`, `error`, `progress`

---

## State Flow Coordination

### Date Change Flow:
1. **User clicks "Change Date"** → `handleChangeDateFromGallery()` → `setIsDateModalOpen(true)`
2. **Modal opens** → DatePicker shows current date
3. **User selects new date** → DatePicker emits selection → Modal stores in `tempSelection`
4. **User clicks "Confirm"** → `handleConfirm()` → `onDateSelect(tempSelection)`
5. **GalleryShell processes**:
   - Closes modal: `setIsDateModalOpen(false)`
   - Resets index: `setCurrentIndex(0)`
   - Updates selection: `setDateSelection(selection)`
   - Updates date: `setCurrentDate(newDate)`
   - Forces remount: `setGalleryKey(prev => prev + 1)`
   - Sets view mode: `setViewMode('workflow')` or `'gallery'`
6. **If workflow enabled**:
   - WorkflowGate detects selection change
   - Resets execution state
   - Executes gates
   - Calls `onComplete()` → `setViewMode('gallery')`
7. **Gallery renders**:
   - `useFacts` or `useFactsRange` reloads with new date
   - Facts load from cache/API
   - GalleryScroller remounts (due to `key` prop)
   - Slides render with new facts

---

## Z-Index Layering

```
z-[101]  DateChangeModal (modal content)
z-[100]  DateChangeModal (backdrop)
z-[60]   "Change Date" button (fixed position)
z-50     Gallery container
z-10     FactOverlay (text content)
z-1      FactSlide (individual slides)
z-0      ImageLayer (background images)
```

---

## Key Coordination Fixes

### ✅ Fixed Issues:
1. **Duplicate Loading Check**: Removed redundant check in GalleryShell
2. **Modal State Sync**: DateChangeModal now properly resets state on open
3. **Workflow Re-execution**: WorkflowGate now detects selection changes and re-executes
4. **Gallery Remount**: GalleryScroller remounts on date change to prevent overlap
5. **Scroll Behavior**: Instant scroll when slides array changes
6. **Z-index Coordination**: Proper layering prevents overlap

### ✅ Coordination Guarantees:
1. **No Overlap**: Modal always above, button always visible, slides below
2. **State Consistency**: All state updates happen in correct order
3. **Clean Transitions**: Remounting prevents stale state
4. **Proper Timing**: Small delays ensure state propagation
5. **Error Handling**: Each component handles its own errors gracefully

---

## Testing Checklist

- [x] Modal opens when clicking "Change Date"
- [x] DatePicker shows current date in modal
- [x] Selecting new date updates temp selection
- [x] "Confirm" button triggers date change
- [x] Modal closes after confirmation
- [x] Workflow executes with new date
- [x] Facts reload for new date
- [x] Gallery remounts with new facts
- [x] Slides render without overlap
- [x] Button remains visible above slides
- [x] Z-index layering works correctly
- [x] State resets properly on date change
- [x] No duplicate renders or infinite loops

---

## Summary

All components are now properly coordinated:
- **State flows** from user action → modal → selection → workflow → gallery
- **Z-index layering** ensures no overlap
- **Remounting** prevents stale state
- **State synchronization** works correctly
- **Error handling** is graceful at each level

The date change flow is now robust and works seamlessly across all components.

