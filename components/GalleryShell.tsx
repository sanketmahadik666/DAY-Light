'use client';

import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { GalleryScroller } from './GalleryScroller';
import { DatePicker } from './DatePicker';
import { DateChangeModal } from './DateChangeModal';
import { WorkflowGate } from './WorkflowGate';
import { useFacts } from '@/hooks/useFacts';
import { useFactsRange } from '@/hooks/useFactsRange';
import { storage, STORAGE_KEYS } from '@/lib/storage';
import { createDefaultWorkflowConfig, createProcessingGate } from '@/lib/workflowHelpers';
import type { Fact } from '@/types/fact';
import type { DateSelection, WorkflowExecutionState } from '@/types/workflow';
import { getTodayDateString } from '@/utils/helpers';

interface GalleryContextType {
  currentIndex: number;
  setCurrentIndex: (index: number) => void;
  slides: Fact[];
}

const GalleryContext = createContext<GalleryContextType | null>(null);

export function useGalleryContext() {
  const context = useContext(GalleryContext);
  if (!context) {
    throw new Error('useGalleryContext must be used within GalleryShell');
  }
  return context;
}

interface GalleryShellProps {
  initialDate?: string;
  initialCategory?: string;
  onClose?: () => void;
  showDatePicker?: boolean; // If true, show date picker first
  enableWorkflow?: boolean; // If true, execute workflow gates
}

type ViewMode = 'date-picker' | 'workflow' | 'gallery';

export function GalleryShell({
  initialDate,
  initialCategory,
  onClose,
  showDatePicker = true,
  enableWorkflow = true,
}: GalleryShellProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>(showDatePicker ? 'date-picker' : 'gallery');
  const [dateSelection, setDateSelection] = useState<DateSelection | null>(null);
  const [workflowComplete, setWorkflowComplete] = useState(false);
  const [currentDate, setCurrentDate] = useState<string>(initialDate || getTodayDateString());
  const [datePickerKey, setDatePickerKey] = useState(0); // Force remount when needed
  const [galleryKey, setGalleryKey] = useState(0); // Force remount of gallery scroller on date change
  const [isDateModalOpen, setIsDateModalOpen] = useState(false);
  
  // Determine which date to use for single-date mode
  const singleDate = dateSelection?.mode === 'single' 
    ? dateSelection.singleDate 
    : dateSelection?.mode === 'range' 
    ? dateSelection.startDate 
    : currentDate;

  // Use appropriate hook based on selection mode
  const singleFacts = useFacts(singleDate || getTodayDateString(), initialCategory);
  const rangeFacts = useFactsRange(dateSelection, initialCategory);
  
  const facts = dateSelection?.mode === 'range' ? rangeFacts.facts : singleFacts.facts;
  const loading = dateSelection?.mode === 'range' ? rangeFacts.loading : singleFacts.loading;
  const error = dateSelection?.mode === 'range' ? rangeFacts.error : singleFacts.error;

  // Reset current index when date changes (new facts will load)
  useEffect(() => {
    // Reset to first slide when date changes
    // This ensures we start at the beginning when new facts load
    setCurrentIndex(0);
  }, [
    singleDate, 
    dateSelection?.mode === 'range' ? dateSelection.startDate : null,
    dateSelection?.mode === 'range' ? dateSelection.endDate : null,
  ]);

  // Force remount the GalleryScroller when the date selection changes.
  // This helps avoid overlapping slides caused by smooth scroll + remount races.
  useEffect(() => {
    setGalleryKey((k) => k + 1);
  }, [
    singleDate,
    dateSelection?.mode === 'range' ? dateSelection.startDate : null,
    dateSelection?.mode === 'range' ? dateSelection.endDate : null,
  ]);

  // Save last visited date
  useEffect(() => {
    if (singleDate && viewMode === 'gallery') {
      // Only save when in gallery view (not during selection)
      storage.set(STORAGE_KEYS.LAST_DATE, singleDate);
    }
  }, [singleDate, viewMode]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' && currentIndex < facts.length - 1) {
        e.preventDefault();
        setCurrentIndex(prev => prev + 1);
      } else if (e.key === 'ArrowUp' && currentIndex > 0) {
        e.preventDefault();
        setCurrentIndex(prev => prev - 1);
      } else if (e.key === 'Escape' && onClose) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, facts.length, onClose]);

  // Prevent body scroll when gallery is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const handleIndexChange = useCallback((index: number) => {
    setCurrentIndex(index);
  }, []);

  // Handle date selection change
  const handleDateSelectionChange = useCallback((selection: DateSelection) => {
    // Reset state for new date selection
    setCurrentIndex(0);
    setDateSelection(selection);
    
    // Update current date for single date mode
    if (selection.mode === 'single' && selection.singleDate) {
      setCurrentDate(selection.singleDate);
    } else if (selection.mode === 'range' && selection.startDate) {
      setCurrentDate(selection.startDate);
    }
    
    if (!enableWorkflow) {
      // Skip workflow, go directly to gallery
      setViewMode('gallery');
    } else {
      // Proceed to workflow
      setViewMode('workflow');
      setWorkflowComplete(false);
    }
  }, [enableWorkflow]);

  // Handle workflow completion
  const handleWorkflowComplete = useCallback((state: WorkflowExecutionState) => {
    setWorkflowComplete(true);
    // Proceed to gallery immediately (no delay)
    setViewMode('gallery');
  }, []);

  // Handle change date from workflow view
  const handleChangeDateFromWorkflow = useCallback(() => {
    setViewMode('date-picker');
    setWorkflowComplete(false);
    setCurrentIndex(0);
    // Force DatePicker to remount
    setDatePickerKey(prev => prev + 1);
    // Don't clear dateSelection - keep it so DatePicker shows current selection
  }, []);

  // Handle change date from gallery view - Open modal instead of full page
  const handleChangeDateFromGallery = useCallback(() => {
    setIsDateModalOpen(true);
  }, []);

  // Handle date selection from modal
  const handleDateSelectFromModal = useCallback((selection: DateSelection) => {
    // Close modal immediately
    setIsDateModalOpen(false);
    
    // CRITICAL: Reset ALL state for clean transition
    setCurrentIndex(0);
    setWorkflowComplete(false);
    
    // Update date selection FIRST - this triggers fact reload
    setDateSelection(selection);
    
    // Update current date - this ensures useFacts hook sees the change
    if (selection.mode === 'single' && selection.singleDate) {
      setCurrentDate(selection.singleDate);
    } else if (selection.mode === 'range' && selection.startDate) {
      setCurrentDate(selection.startDate);
    }
    
    // Force gallery remount to prevent overlap
    setGalleryKey(prev => prev + 1);
    
    // Small delay to ensure state updates propagate before workflow
    // Execute workflow if enabled
    if (enableWorkflow) {
      // Use setTimeout to ensure state updates complete
      setTimeout(() => {
        setViewMode('workflow');
        setWorkflowComplete(false);
      }, 50);
    } else {
      // Skip workflow, go directly to gallery
      setTimeout(() => {
        setViewMode('gallery');
      }, 50);
    }
  }, [enableWorkflow]);

  // Create workflow config
  const workflowConfig = createDefaultWorkflowConfig([
    createProcessingGate('data-processing', async (selection) => {
      // This gate processes the date selection
      // Facts are already being fetched by useFactsRange/useFacts
      return { selection, processed: true };
    }),
  ], {
    stopOnFirstFailure: false,
    continueOnOptionalFailure: true,
    maxExecutionTime: 30000,
  });

  // Render date picker view
  if (viewMode === 'date-picker') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <div className="w-full max-w-2xl bg-white dark:bg-gray-800 rounded-xl shadow-xl p-6 md:p-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">DAY-LIGHT</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            Select a date or date range to explore historical facts
          </p>
          <DatePicker
            key={datePickerKey} // Force remount when key changes
            mode="single"
            initialDate={dateSelection?.mode === 'single' ? dateSelection.singleDate : currentDate}
            onSelectionChange={handleDateSelectionChange}
            onValidationChange={(isValid) => {
              // Validation feedback handled by DatePicker
            }}
            className="mb-4"
          />
          {onClose && (
            <button
              onClick={onClose}
              className="mt-4 px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    );
  }

  // Render workflow view
  if (viewMode === 'workflow') {
    const displayDate = dateSelection?.mode === 'single' 
      ? dateSelection.singleDate 
      : dateSelection?.mode === 'range' 
      ? `${dateSelection.startDate} to ${dateSelection.endDate}`
      : 'Unknown';

    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <div className="w-full max-w-2xl bg-white dark:bg-gray-800 rounded-xl shadow-xl p-6 md:p-8">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Processing Request</h2>
              {dateSelection && (
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Date: <span className="font-medium">{displayDate}</span>
                </p>
              )}
            </div>
            <button
              onClick={handleChangeDateFromWorkflow}
              className="px-4 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 bg-blue-50 dark:bg-blue-900/20 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
              aria-label="Change date"
            >
              Change Date
            </button>
          </div>
          {dateSelection && (
            <WorkflowGate
              config={workflowConfig}
              selection={dateSelection}
              onComplete={handleWorkflowComplete}
              onSkip={() => {
                // Allow skipping workflow and going directly to gallery
                setViewMode('gallery');
              }}
              onProgress={(state) => {
                // Progress updates handled by WorkflowGate component
              }}
            />
          )}
        </div>
      </div>
    );
  }

  // Render gallery view
  if (viewMode === 'gallery') {
    // Show loading state if no facts yet
    if (loading && facts.length === 0) {
      return (
        <div className="flex items-center justify-center min-h-screen bg-black">
          <div className="text-lg text-white">Loading facts...</div>
          {showDatePicker && (
            <button
              onClick={handleChangeDateFromGallery}
              className="absolute top-4 left-4 z-[60] px-4 py-2 bg-black/70 text-white rounded-lg hover:bg-black/90 backdrop-blur-md transition-colors shadow-lg border border-white/10"
              aria-label="Change date"
            >
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Change Date
              </span>
            </button>
          )}
        </div>
      );
    }

    // Show error state if error and no facts
    if (error && facts.length === 0) {
      return (
        <div className="flex items-center justify-center min-h-screen bg-black">
          <div className="text-center">
            <div className="text-lg text-red-500 mb-4">Error loading facts: {error.message}</div>
            {showDatePicker && (
              <button
                onClick={handleChangeDateFromGallery}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Change Date
              </button>
            )}
          </div>
        </div>
      );
    }
  }

  return (
    <>
      <GalleryContext.Provider value={{ currentIndex, setCurrentIndex, slides: facts }}>
        <div
          className="fixed inset-0 z-50 bg-black"
          role="region"
          aria-label="Fact gallery"
          aria-live="polite"
          style={{ 
            isolation: 'isolate', // Create new stacking context
          }}
        >
          {/* Header with change date button - Higher z-index to prevent overlap */}
          {showDatePicker && (
            <button
              onClick={handleChangeDateFromGallery}
              className="absolute top-4 left-4 z-[60] px-4 py-2 bg-black/70 text-white rounded-lg hover:bg-black/90 backdrop-blur-md transition-colors shadow-lg border border-white/10"
              style={{ 
                position: 'fixed', // Ensure it stays on top
                zIndex: 60,
              }}
              aria-label="Change date"
            >
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Change Date
              </span>
            </button>
          )}
          {facts.length > 0 && (
            <GalleryScroller
              key={galleryKey}
              slides={facts}
              currentIndex={currentIndex}
              onIndexChange={handleIndexChange}
              prefetchDistance={2}
            />
          )}
        </div>
      </GalleryContext.Provider>

      {/* Date Change Modal - High z-index to appear above everything */}
      {showDatePicker && (
        <DateChangeModal
          isOpen={isDateModalOpen}
          onClose={() => setIsDateModalOpen(false)}
          onDateSelect={handleDateSelectFromModal}
          currentDate={singleDate}
        />
      )}
    </>
  );
}

