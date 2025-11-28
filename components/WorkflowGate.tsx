/**
 * FILE: components/WorkflowGate.tsx
 * PURPOSE: Sequential workflow gate execution with validation, processing, and approval stages
 * 
 * KEY RESPONSIBILITIES:
 *   - Execute workflow gates sequentially
 *   - Validate conditions before processing
 *   - Show progress and feedback to users
 *   - Handle errors gracefully with user feedback
 *   - Support customizable gate conditions
 * 
 * FALLBACKS:
 *   - If gate fails and is optional, continue to next gate
 *   - If gate times out, mark as failed and continue (if optional)
 *   - If all gates fail, show error summary
 * 
 * ERROR HANDLING:
 *   - Gate timeout: Show timeout error, mark gate as failed
 *   - Validation failure: Show validation error, prevent processing
 *   - Processing error: Show error message, allow retry if configured
 *   - Network errors: Handled by individual gates
 * 
 * INTEGRATION:
 *   - Used by: GalleryShell
 *   - Uses: types/workflow.ts, useFacts hook
 * 
 * ROBUSTNESS GUARANTEES:
 *   - Timeout: Configurable per gate (default 5s), max execution time (default 30s)
 *   - Never blocks: Yes (async execution with progress updates)
 *   - Fallback: Yes (optional gates can be skipped, errors shown to user)
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  WorkflowGate,
  WorkflowGateResult,
  WorkflowExecutionState,
  WorkflowConfig,
  DateSelection,
} from '@/types/workflow';

interface WorkflowGateProps {
  config: WorkflowConfig;
  selection: DateSelection;
  onComplete: (state: WorkflowExecutionState) => void;
  onProgress?: (state: WorkflowExecutionState) => void;
  onSkip?: () => void; // Allow skipping workflow
  className?: string;
}

export function WorkflowGate({
  config,
  selection,
  onComplete,
  onProgress,
  onSkip,
  className = '',
}: WorkflowGateProps) {
  const [executionState, setExecutionState] = useState<WorkflowExecutionState>({
    selection,
    gates: config.gates,
    results: [],
    currentGateIndex: 0,
    isRunning: false,
    isComplete: false,
    hasErrors: false,
  });

  // Execute a single gate
  const executeGate = useCallback(
    async (gate: WorkflowGate, index: number): Promise<WorkflowGateResult> => {
      const startTime = Date.now();
      const timeout = gate.timeout || 5000;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        // Step 1: Validate conditions
        for (const condition of gate.conditions) {
          if (controller.signal.aborted) {
            throw new Error('Gate execution timeout');
          }

          const isValid = await Promise.resolve(
            condition.validator(selection, { signal: controller.signal })
          );

          if (!isValid) {
            const errorMessage = condition.errorMessage || `Condition ${condition.id} failed`;
            throw new Error(errorMessage);
          }
        }

        // Step 2: Execute processor (if provided)
        let result: any = undefined;
        if (gate.processor) {
          result = await Promise.resolve(gate.processor(selection, { signal: controller.signal }));
        }

        clearTimeout(timeoutId);

        const duration = Date.now() - startTime;
        gate.onSuccess?.(result);

        return {
          gateId: gate.id,
          status: 'passed',
          result,
          duration,
          timestamp: Date.now(),
        };
      } catch (error) {
        clearTimeout(timeoutId);
        const duration = Date.now() - startTime;
        const err = error instanceof Error ? error : new Error('Unknown error');

        gate.onFailure?.(err);

        return {
          gateId: gate.id,
          status: gate.required === false ? 'skipped' : 'failed',
          error: err,
          duration,
          timestamp: Date.now(),
        };
      }
    },
    [selection]
  );

  // Execute all gates sequentially
  const executeWorkflow = useCallback(async () => {
    const startTime = Date.now();
    const maxExecutionTime = config.maxExecutionTime || 30000;
    const stopOnFirstFailure = config.stopOnFirstFailure || false;
    const continueOnOptionalFailure = config.continueOnOptionalFailure !== false;

    setExecutionState(prev => ({
      ...prev,
      isRunning: true,
      startTime,
      currentGateIndex: 0,
      results: [],
      hasErrors: false,
    }));

    const results: WorkflowGateResult[] = [];

    for (let i = 0; i < config.gates.length; i++) {
      // Check max execution time
      if (Date.now() - startTime > maxExecutionTime) {
        results.push({
          gateId: config.gates[i].id,
          status: 'failed',
          error: new Error('Maximum execution time exceeded'),
          timestamp: Date.now(),
        });
        break;
      }

      // Update current gate index
      setExecutionState(prev => ({
        ...prev,
        currentGateIndex: i,
      }));

      // Execute gate
      const result = await executeGate(config.gates[i], i);
      results.push(result);

      // Update state with result
      setExecutionState(prev => {
        const newResults = [...prev.results, result];
        const hasErrors = newResults.some(r => r.status === 'failed');
        return {
          ...prev,
          results: newResults,
          hasErrors,
        };
      });

      // Notify progress
      onProgress?.({
        selection,
        gates: config.gates,
        results,
        currentGateIndex: i + 1,
        isRunning: true,
        isComplete: false,
        hasErrors: results.some(r => r.status === 'failed'),
        startTime,
      });

      // Stop on first failure if configured
      if (stopOnFirstFailure && result.status === 'failed') {
        break;
      }

      // Skip optional gates on failure if configured
      if (result.status === 'failed' && config.gates[i].required === false && !continueOnOptionalFailure) {
        continue;
      }
    }

    const endTime = Date.now();
    const finalState: WorkflowExecutionState = {
      selection,
      gates: config.gates,
      results,
      currentGateIndex: config.gates.length,
      isRunning: false,
      isComplete: true,
      hasErrors: results.some(r => r.status === 'failed'),
      startTime,
      endTime,
    };

    setExecutionState(finalState);
    onComplete(finalState);
  }, [config, selection, executeGate, onComplete, onProgress]);

  // Track previous selection to detect changes
  const prevSelectionRef = useRef<string>('');
  
  // Auto-execute on mount or when selection changes
  useEffect(() => {
    // Create a stable key for the selection
    const selectionKey = selection.mode === 'single' 
      ? selection.singleDate || '' 
      : `${selection.startDate || ''}-${selection.endDate || ''}`;
    
    // Only execute if selection changed and not already running
    const selectionChanged = prevSelectionRef.current !== selectionKey;
    prevSelectionRef.current = selectionKey;
    
    if (selectionChanged && !executionState.isRunning && !executionState.isComplete) {
      // Reset state for new selection
      setExecutionState({
        selection,
        gates: config.gates,
        results: [],
        currentGateIndex: 0,
        isRunning: false,
        isComplete: false,
        hasErrors: false,
      });
      // Execute workflow
      executeWorkflow();
    } else if (!executionState.isRunning && !executionState.isComplete && !selectionChanged) {
      // First mount, execute workflow
      executeWorkflow();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection.mode === 'single' ? selection.singleDate : `${selection.startDate || ''}-${selection.endDate || ''}`]);

  // Get current gate
  const currentGate = executionState.gates[executionState.currentGateIndex];
  const totalGates = executionState.gates.length;
  const progress = totalGates > 0 ? ((executionState.currentGateIndex + 1) / totalGates) * 100 : 0;

  return (
    <div className={`workflow-gate ${className}`} role="region" aria-label="Workflow execution">
      {/* Progress Bar */}
      <div className="mb-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-2">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {executionState.isRunning
              ? `Processing: ${currentGate?.name || 'Unknown'}`
              : executionState.isComplete
              ? 'Complete'
              : 'Ready'}
          </span>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {executionState.currentGateIndex + 1} / {totalGates}
          </span>
        </div>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
          <div
            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
      </div>

      {/* Gate Status List */}
      <div className="space-y-2" role="list" aria-label="Gate execution status">
        {executionState.gates.map((gate, index) => {
          const result = executionState.results[index];
          const isCurrent = index === executionState.currentGateIndex && executionState.isRunning;
          const isPending = !result && !isCurrent;
          const status = result?.status || (isCurrent ? 'running' : 'pending');

          return (
            <div
              key={gate.id}
              role="listitem"
              className={`p-3 rounded-lg border transition-colors ${
                status === 'passed'
                  ? 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700'
                  : status === 'failed'
                  ? 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700'
                  : status === 'running'
                  ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700'
                  : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {status === 'passed' && (
                    <span className="text-green-600 dark:text-green-400" aria-label="Passed">
                      ✓
                    </span>
                  )}
                  {status === 'failed' && (
                    <span className="text-red-600 dark:text-red-400" aria-label="Failed">
                      ✗
                    </span>
                  )}
                  {status === 'running' && (
                    <span className="text-blue-600 dark:text-blue-400 animate-spin" aria-label="Running">
                      ⟳
                    </span>
                  )}
                  {status === 'pending' && (
                    <span className="text-gray-400" aria-label="Pending">
                      ○
                    </span>
                  )}
                  <span className="font-medium text-gray-900 dark:text-gray-100">{gate.name}</span>
                </div>
                {result?.duration && (
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {result.duration}ms
                  </span>
                )}
              </div>
              {gate.description && (
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{gate.description}</p>
              )}
              {result?.error && (
                <p className="text-sm text-red-600 dark:text-red-400 mt-2" role="alert">
                  {result.error.message}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Error Summary */}
      {executionState.isComplete && executionState.hasErrors && (
        <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-700 rounded-lg" role="alert">
          <h3 className="font-medium text-red-900 dark:text-red-100 mb-2">Errors Summary</h3>
          <ul className="list-disc list-inside space-y-1 text-sm text-red-800 dark:text-red-200">
            {executionState.results
              .filter(r => r.status === 'failed')
              .map(r => (
                <li key={r.gateId}>
                  {executionState.gates.find(g => g.id === r.gateId)?.name}: {r.error?.message}
                </li>
              ))}
          </ul>
        </div>
      )}

      {/* Success Message */}
      {executionState.isComplete && !executionState.hasErrors && (
        <div className="mt-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-300 dark:border-green-700 rounded-lg" role="alert">
          <div className="flex justify-between items-center">
            <p className="text-sm font-medium text-green-900 dark:text-green-100">
              All workflow gates passed successfully!
            </p>
            {onComplete && (
              <button
                onClick={() => {
                  // Trigger completion callback immediately
                  onComplete(executionState);
                }}
                className="ml-4 px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors"
              >
                Continue to Gallery
              </button>
            )}
          </div>
        </div>
      )}

      {/* Skip Button (shown while running) */}
      {executionState.isRunning && onSkip && (
        <div className="mt-4 flex justify-end">
          <button
            onClick={onSkip}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
          >
            Skip to Gallery
          </button>
        </div>
      )}
    </div>
  );
}

