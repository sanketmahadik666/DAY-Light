/**
 * FILE: types/workflow.ts
 * PURPOSE: Type definitions for workflow gate system
 * 
 * KEY RESPONSIBILITIES:
 *   - Define workflow gate types and interfaces
 *   - Define date selection types (single date, date range)
 *   - Define gate condition types
 *   - Define workflow execution state
 * 
 * INTEGRATION:
 *   - Used by: DatePicker, WorkflowGate, GalleryShell
 *   - Uses: None (base types)
 */

export type DateSelectionMode = 'single' | 'range';

export interface DateSelection {
  mode: DateSelectionMode;
  singleDate?: string; // YYYY-MM-DD
  startDate?: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
}

export type WorkflowGateType = 'validation' | 'processing' | 'approval';

export type GateStatus = 'pending' | 'running' | 'passed' | 'failed' | 'skipped';

export interface WorkflowGateCondition {
  id: string;
  type: 'date-range' | 'date-valid' | 'data-available' | 'custom';
  validator: (selection: DateSelection, context?: any) => Promise<boolean> | boolean;
  errorMessage?: string;
  required?: boolean;
}

export interface WorkflowGate {
  id: string;
  type: WorkflowGateType;
  name: string;
  description?: string;
  conditions: WorkflowGateCondition[];
  processor?: (selection: DateSelection, context?: any) => Promise<any>;
  onSuccess?: (result: any) => void;
  onFailure?: (error: Error) => void;
  timeout?: number; // milliseconds, default 5000
  required?: boolean; // if false, can be skipped on failure
}

export interface WorkflowGateResult {
  gateId: string;
  status: GateStatus;
  result?: any;
  error?: Error;
  duration?: number; // milliseconds
  timestamp: number;
}

export interface WorkflowExecutionState {
  selection: DateSelection;
  gates: WorkflowGate[];
  results: WorkflowGateResult[];
  currentGateIndex: number;
  isRunning: boolean;
  isComplete: boolean;
  hasErrors: boolean;
  startTime?: number;
  endTime?: number;
}

export interface WorkflowConfig {
  gates: WorkflowGate[];
  stopOnFirstFailure?: boolean; // default: false
  continueOnOptionalFailure?: boolean; // default: true
  maxExecutionTime?: number; // milliseconds, default: 30000
}

