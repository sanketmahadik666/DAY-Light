/**
 * FILE: lib/workflowHelpers.ts
 * PURPOSE: Helper functions for creating and configuring workflow gates
 * 
 * KEY RESPONSIBILITIES:
 *   - Create default workflow gate configurations
 *   - Create custom gate conditions
 *   - Validate date selections
 *   - Process date selections for fact fetching
 * 
 * FALLBACKS:
 *   - If validation fails, return error message
 *   - If processing fails, return error result
 * 
 * ERROR HANDLING:
 *   - Invalid date selection: Return validation error
 *   - Processing errors: Return error with message
 * 
 * INTEGRATION:
 *   - Used by: WorkflowGate, GalleryShell
 *   - Uses: types/workflow.ts, utils/helpers.ts
 * 
 * ROBUSTNESS GUARANTEES:
 *   - Timeout: N/A (helpers only)
 *   - Never blocks: Yes
 *   - Fallback: Yes (returns error results)
 */

import type {
  WorkflowGate,
  WorkflowGateCondition,
  WorkflowConfig,
  DateSelection,
} from '@/types/workflow';
import { isValidDateString, parseDate } from '@/utils/helpers';

/**
 * Create a date validation condition
 */
export function createDateValidationCondition(
  id: string,
  errorMessage?: string
): WorkflowGateCondition {
  return {
    id,
    type: 'date-valid',
    validator: (selection: DateSelection): boolean => {
      if (selection.mode === 'single') {
        return selection.singleDate ? isValidDateString(selection.singleDate) : false;
      } else {
        return Boolean(
          selection.startDate &&
          selection.endDate &&
          isValidDateString(selection.startDate) &&
          isValidDateString(selection.endDate) &&
          selection.startDate <= selection.endDate
        );
      }
    },
    errorMessage: errorMessage || 'Invalid date selection',
    required: true,
  };
}

/**
 * Create a date range validation condition
 */
export function createDateRangeCondition(
  id: string,
  maxDays?: number,
  errorMessage?: string
): WorkflowGateCondition {
  return {
    id,
    type: 'date-range',
    validator: (selection: DateSelection) => {
      if (selection.mode === 'single') {
        return true; // Single date is always valid
      }

      if (!selection.startDate || !selection.endDate) {
        return false;
      }

      const start = parseDate(selection.startDate);
      const end = parseDate(selection.endDate);
      const diffTime = Math.abs(end.getTime() - start.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (maxDays && diffDays > maxDays) {
        return false;
      }

      return Boolean(selection.startDate && selection.endDate && selection.startDate <= selection.endDate);
    },
    errorMessage: errorMessage || `Date range must be within ${maxDays || 'unlimited'} days`,
    required: true,
  };
}

/**
 * Create a data availability condition
 */
export function createDataAvailabilityCondition(
  id: string,
  checkFunction: (selection: DateSelection) => Promise<boolean>,
  errorMessage?: string
): WorkflowGateCondition {
  return {
    id,
    type: 'data-available',
    validator: checkFunction,
    errorMessage: errorMessage || 'Data not available for selected date(s)',
    required: false, // Optional by default
  };
}

/**
 * Create default validation gate
 */
export function createValidationGate(id: string, conditions: WorkflowGateCondition[]): WorkflowGate {
  return {
    id,
    type: 'validation',
    name: 'Date Validation',
    description: 'Validates date selection format and constraints',
    conditions,
    required: true,
    timeout: 3000,
  };
}

/**
 * Create default processing gate
 */
export function createProcessingGate(
  id: string,
  processor: (selection: DateSelection, context?: any) => Promise<any>,
  conditions: WorkflowGateCondition[] = []
): WorkflowGate {
  return {
    id,
    type: 'processing',
    name: 'Data Processing',
    description: 'Processes date selection and prepares data',
    conditions,
    processor,
    required: true,
    timeout: 10000,
  };
}

/**
 * Create default approval gate
 */
export function createApprovalGate(
  id: string,
  conditions: WorkflowGateCondition[] = [],
  required: boolean = false
): WorkflowGate {
  return {
    id,
    type: 'approval',
    name: 'Final Approval',
    description: 'Final validation before proceeding',
    conditions,
    required,
    timeout: 5000,
  };
}

/**
 * Create default workflow config for date-based fact gallery
 */
export function createDefaultWorkflowConfig(
  customGates?: WorkflowGate[],
  options?: {
    stopOnFirstFailure?: boolean;
    continueOnOptionalFailure?: boolean;
    maxExecutionTime?: number;
  }
): WorkflowConfig {
  const defaultGates: WorkflowGate[] = [
    createValidationGate('date-validation', [
      createDateValidationCondition('date-format'),
      createDateRangeCondition('date-range', 365, 'Date range must be within 365 days'),
    ]),
  ];

  if (customGates) {
    defaultGates.push(...customGates);
  }

  return {
    gates: defaultGates,
    stopOnFirstFailure: options?.stopOnFirstFailure || false,
    continueOnOptionalFailure: options?.continueOnOptionalFailure !== false,
    maxExecutionTime: options?.maxExecutionTime || 30000,
  };
}

/**
 * Generate date list from selection (for range mode)
 */
export function generateDateList(selection: DateSelection): string[] {
  if (selection.mode === 'single' && selection.singleDate) {
    return [selection.singleDate];
  }

  if (selection.mode === 'range' && selection.startDate && selection.endDate) {
    const dates: string[] = [];
    const start = parseDate(selection.startDate);
    const end = parseDate(selection.endDate);
    const current = new Date(start);

    while (current <= end) {
      dates.push(
        `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(
          current.getDate()
        ).padStart(2, '0')}`
      );
      current.setDate(current.getDate() + 1);
    }

    return dates;
  }

  return [];
}

