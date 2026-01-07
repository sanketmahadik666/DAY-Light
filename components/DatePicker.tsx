/**
 * FILE: components/DatePicker.tsx
 * PURPOSE: User-centric date selection component with single date and date range support
 * 
 * KEY RESPONSIBILITIES:
 *   - Provide intuitive date selection UI (single date or date range)
 *   - Validate date inputs
 *   - Emit selection events
 *   - Support keyboard navigation and accessibility
 * 
 * FALLBACKS:
 *   - If invalid date entered, show error message and prevent submission
 *   - If date range invalid (end < start), show error and prevent submission
 * 
 * ERROR HANDLING:
 *   - Invalid date format: Show inline error, disable submit
 *   - Invalid date range: Show inline error, disable submit
 *   - Network errors: Handled by parent component
 * 
 * INTEGRATION:
 *   - Used by: GalleryShell, WorkflowGate
 *   - Uses: helpers.ts (formatDate, parseDate, isValidDateString)
 * 
 * ROBUSTNESS GUARANTEES:
 *   - Timeout: N/A (client-side only)
 *   - Never blocks: Yes
 *   - Fallback: Yes (shows error messages, prevents invalid submissions)
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { formatDate, parseDate, isValidDateString, getTodayDateString } from '@/utils/helpers';
import type { DateSelection, DateSelectionMode } from '@/types/workflow';

interface DatePickerProps {
  mode?: DateSelectionMode;
  initialDate?: string; // YYYY-MM-DD
  initialStartDate?: string; // YYYY-MM-DD
  initialEndDate?: string; // YYYY-MM-DD
  onSelectionChange: (selection: DateSelection) => void;
  onValidationChange?: (isValid: boolean) => void;
  className?: string;
  disabled?: boolean;
  minDate?: string; // YYYY-MM-DD
  maxDate?: string; // YYYY-MM-DD
}

export function DatePicker({
  mode = 'single',
  initialDate,
  initialStartDate,
  initialEndDate,
  onSelectionChange,
  onValidationChange,
  className = '',
  disabled = false,
  minDate,
  maxDate,
}: DatePickerProps) {
  const [selectionMode, setSelectionMode] = useState<DateSelectionMode>(mode);
  const [singleDate, setSingleDate] = useState<string>(initialDate || getTodayDateString());
  const [startDate, setStartDate] = useState<string>(initialStartDate || getTodayDateString());
  const [endDate, setEndDate] = useState<string>(initialEndDate || getTodayDateString());
  
  const [errors, setErrors] = useState<{
    singleDate?: string;
    startDate?: string;
    endDate?: string;
    range?: string;
  }>({});

  // Sync internal state with prop changes (important for "Change Date" functionality)
  useEffect(() => {
    if (initialDate && initialDate !== singleDate) {
      setSingleDate(initialDate);
    }
  }, [initialDate]);

  useEffect(() => {
    if (initialStartDate && initialStartDate !== startDate) {
      setStartDate(initialStartDate);
    }
  }, [initialStartDate]);

  useEffect(() => {
    if (initialEndDate && initialEndDate !== endDate) {
      setEndDate(initialEndDate);
    }
  }, [initialEndDate]);

  useEffect(() => {
    if (mode !== selectionMode) {
      setSelectionMode(mode);
    }
  }, [mode]);

  // Validate single date
  const validateSingleDate = useCallback((date: string): boolean => {
    if (!isValidDateString(date)) {
      setErrors(prev => ({ ...prev, singleDate: 'Invalid date format. Use YYYY-MM-DD' }));
      return false;
    }

    const dateObj = parseDate(date);
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    if (minDate && date < minDate) {
      setErrors(prev => ({ ...prev, singleDate: `Date must be after ${minDate}` }));
      return false;
    }

    if (maxDate && date > maxDate) {
      setErrors(prev => ({ ...prev, singleDate: `Date must be before ${maxDate}` }));
      return false;
    }

    setErrors(prev => {
      const { singleDate: _, ...rest } = prev;
      return rest;
    });
    return true;
  }, [minDate, maxDate]);

  // Validate date range
  const validateDateRange = useCallback((start: string, end: string): boolean => {
    let isValid = true;
    const newErrors: typeof errors = {};

    if (!isValidDateString(start)) {
      newErrors.startDate = 'Invalid start date format. Use YYYY-MM-DD';
      isValid = false;
    }

    if (!isValidDateString(end)) {
      newErrors.endDate = 'Invalid end date format. Use YYYY-MM-DD';
      isValid = false;
    }

    if (isValid && start > end) {
      newErrors.range = 'End date must be after start date';
      isValid = false;
    }

    if (minDate && start < minDate) {
      newErrors.startDate = `Start date must be after ${minDate}`;
      isValid = false;
    }

    if (maxDate && end > maxDate) {
      newErrors.endDate = `End date must be before ${maxDate}`;
      isValid = false;
    }

    setErrors(newErrors);
    return isValid;
  }, [minDate, maxDate]);

  // Emit selection change
  const emitSelection = useCallback(() => {
    const selection: DateSelection = {
      mode: selectionMode,
      ...(selectionMode === 'single' ? { singleDate } : { startDate, endDate }),
    };

    let isValid = false;
    if (selectionMode === 'single') {
      isValid = validateSingleDate(singleDate);
    } else {
      isValid = validateDateRange(startDate, endDate);
    }

    if (isValid) {
      onSelectionChange(selection);
    }

    onValidationChange?.(isValid);
  }, [selectionMode, singleDate, startDate, endDate, validateSingleDate, validateDateRange, onSelectionChange, onValidationChange]);

  // Update selection when mode changes
  useEffect(() => {
    emitSelection();
  }, [selectionMode, emitSelection]);

  // Update selection when dates change
  // NOTE: This auto-emits on every change. Parent components should handle this appropriately.
  // For modal usage, parent should use onValidationChange to track validity without auto-submitting.
  // Update selection when dates change
  // Debounced to avoid spamming parent on every keystroke
  useEffect(() => {
    const timer = setTimeout(() => {
        if (selectionMode === 'single') {
          validateSingleDate(singleDate);
        } else {
          validateDateRange(startDate, endDate);
        }
        emitSelection();
    }, 300);

    return () => clearTimeout(timer);
  }, [singleDate, startDate, endDate, selectionMode, validateSingleDate, validateDateRange, emitSelection]);

  const handleModeChange = (newMode: DateSelectionMode) => {
    setSelectionMode(newMode);
    setErrors({});
  };

  const handleSingleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSingleDate(value);
  };

  const handleStartDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setStartDate(value);
  };

  const handleEndDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setEndDate(value);
  };

  const today = getTodayDateString();
  const minDateAttr = minDate || undefined;
  const maxDateAttr = maxDate || undefined;

  return (
    <div className={`date-picker ${className}`} role="group" aria-label="Date selection">
      {/* Mode Toggle */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4" role="tablist" aria-label="Selection mode">
        <button
          type="button"
          role="tab"
          aria-selected={selectionMode === 'single' ? 'true' : 'false'}
          aria-controls="single-date-panel"
          onClick={() => handleModeChange('single')}
          disabled={disabled}
          className={`px-4 py-2 rounded-lg font-medium transition-colors text-sm sm:text-base ${
            selectionMode === 'single'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          Single Date
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={selectionMode === 'range' ? 'true' : 'false'}
          aria-controls="range-date-panel"
          onClick={() => handleModeChange('range')}
          disabled={disabled}
          className={`px-4 py-2 rounded-lg font-medium transition-colors text-sm sm:text-base ${
            selectionMode === 'range'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          Date Range
        </button>
      </div>

      {/* Single Date Panel */}
      {selectionMode === 'single' && (
        <div
          id="single-date-panel"
          role="tabpanel"
          aria-labelledby="single-date-tab"
          className="space-y-2"
        >
          <label htmlFor="single-date-input" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Select Date
          </label>
          <input
            id="single-date-input"
            type="date"
            value={singleDate}
            onChange={handleSingleDateChange}
            min={minDateAttr}
            max={maxDateAttr}
            disabled={disabled}
            aria-invalid={errors.singleDate ? 'true' : 'false'}
            aria-describedby={errors.singleDate ? 'single-date-error' : undefined}
            className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:border-gray-600 dark:text-white ${
              errors.singleDate ? 'border-red-500' : 'border-gray-300'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          />
          {errors.singleDate && (
            <p id="single-date-error" className="text-sm text-red-600 dark:text-red-400" role="alert">
              {errors.singleDate}
            </p>
          )}
        </div>
      )}

      {/* Date Range Panel */}
      {selectionMode === 'range' && (
        <div
          id="range-date-panel"
          role="tabpanel"
          aria-labelledby="range-date-tab"
          className="space-y-4"
        >
          <div className="space-y-2">
            <label htmlFor="start-date-input" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Start Date
            </label>
            <input
              id="start-date-input"
              type="date"
              value={startDate}
              onChange={handleStartDateChange}
              min={minDateAttr}
              max={maxDateAttr}
              disabled={disabled}
              aria-invalid={errors.startDate ? 'true' : 'false'}
              aria-describedby={errors.startDate ? 'start-date-error' : undefined}
              className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:border-gray-600 dark:text-white ${
                errors.startDate ? 'border-red-500' : 'border-gray-300'
              } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            />
            {errors.startDate && (
              <p id="start-date-error" className="text-sm text-red-600 dark:text-red-400" role="alert">
                {errors.startDate}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label htmlFor="end-date-input" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              End Date
            </label>
            <input
              id="end-date-input"
              type="date"
              value={endDate}
              onChange={handleEndDateChange}
              min={startDate || minDateAttr}
              max={maxDateAttr}
              disabled={disabled}
              aria-invalid={errors.endDate ? 'true' : 'false'}
              aria-describedby={errors.endDate ? 'end-date-error' : undefined}
              className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:border-gray-600 dark:text-white ${
                errors.endDate ? 'border-red-500' : 'border-gray-300'
              } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            />
            {errors.endDate && (
              <p id="end-date-error" className="text-sm text-red-600 dark:text-red-400" role="alert">
                {errors.endDate}
              </p>
            )}
          </div>

          {errors.range && (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {errors.range}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

