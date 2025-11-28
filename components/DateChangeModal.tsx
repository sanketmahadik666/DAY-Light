/**
 * FILE: components/DateChangeModal.tsx
 * PURPOSE: Modal popup for date selection that doesn't overlap with slides
 * 
 * KEY RESPONSIBILITIES:
 *   - Display date picker in a modal overlay
 *   - Prevent overlap with gallery slides
 *   - Handle date selection and trigger facts reload
 *   - Smooth animations and transitions
 * 
 * FALLBACKS:
 *   - If modal fails, fallback to inline date picker
 * 
 * ERROR HANDLING:
 *   - Invalid dates: Show validation errors
 *   - Modal close: Cancel date change
 * 
 * INTEGRATION:
 *   - Used by: GalleryShell
 *   - Uses: DatePicker component
 * 
 * ROBUSTNESS GUARANTEES:
 *   - Timeout: N/A (client-side only)
 *   - Never blocks: Yes
 *   - Fallback: Yes (can close modal)
 */

'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DatePicker } from './DatePicker';
import type { DateSelection } from '@/types/workflow';
import { getTodayDateString } from '@/utils/helpers';

interface DateChangeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDateSelect: (selection: DateSelection) => void;
  currentDate?: string;
  className?: string;
}

export function DateChangeModal({
  isOpen,
  onClose,
  onDateSelect,
  currentDate,
  className = '',
}: DateChangeModalProps) {
  const [selectedDate, setSelectedDate] = useState<string>(currentDate || getTodayDateString());
  const [isValid, setIsValid] = useState(true);
  const [tempSelection, setTempSelection] = useState<DateSelection | null>(null);

  // Reset selected date when modal opens or currentDate changes
  useEffect(() => {
    if (isOpen) {
      const dateToUse = currentDate || getTodayDateString();
      setSelectedDate(dateToUse);
      setTempSelection(null);
      setIsValid(true);
    }
  }, [isOpen, currentDate]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Handle date picker selection change (temporary, not yet confirmed)
  const handleDatePickerChange = useCallback((selection: DateSelection) => {
    setTempSelection(selection);
    if (selection.mode === 'single' && selection.singleDate) {
      setSelectedDate(selection.singleDate);
    }
  }, []);

  // Handle validation change
  const handleValidationChange = useCallback((valid: boolean) => {
    setIsValid(valid);
  }, []);

  // Handle confirm button - only then trigger the actual date change
  const handleConfirm = useCallback(() => {
    if (tempSelection && isValid) {
      onDateSelect(tempSelection);
      // Modal will close after date selection (handled by parent)
    } else if (isValid && selectedDate) {
      // Fallback: create selection from selectedDate
      const selection: DateSelection = {
        mode: 'single',
        singleDate: selectedDate,
      };
      onDateSelect(selection);
    }
  }, [tempSelection, isValid, selectedDate, onDateSelect]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className={`fixed inset-0 z-[101] flex items-center justify-center p-4 pointer-events-none ${className}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="date-modal-title"
          >
            <div
              className="w-full max-w-2xl bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 md:p-8 pointer-events-auto max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h2
                    id="date-modal-title"
                    className="text-2xl font-bold text-gray-900 dark:text-white mb-2"
                  >
                    Change Date
                  </h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Select a new date to explore different historical facts
                  </p>
                </div>
                <button
                  onClick={onClose}
                  className="ml-4 p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  aria-label="Close modal"
                >
                  <svg
                    className="w-6 h-6"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>

              {/* Date Picker */}
              <DatePicker
                mode="single"
                initialDate={selectedDate}
                onSelectionChange={handleDatePickerChange}
                onValidationChange={handleValidationChange}
                className="mb-4"
              />

              {/* Actions */}
              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={!isValid}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
                >
                  Confirm & Load Facts
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

