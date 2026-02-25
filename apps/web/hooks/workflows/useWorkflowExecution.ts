"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDispatch, useSelector } from "react-redux";
import { toast } from "react-toastify";

import { dismissJob, useJobs } from "@/lib/api/processes";
import {
  type WorkflowExecuteRequest,
  cleanupWorkflowTemp,
  executeWorkflow,
  finalizeWorkflowLayer,
} from "@/lib/api/workflows";
import type { AppDispatch } from "@/lib/store";
import { setRunningJobIds } from "@/lib/store/jobs/slice";
import { selectEdges, selectNodes, selectVariables } from "@/lib/store/workflow/selectors";

import { useAppSelector } from "@/hooks/store/ContextHooks";

import type {
  NodeExecutionInfo,
  NodeExecutionStatus,
} from "@/components/workflows/context/WorkflowExecutionContext";

/**
 * Workflow execution state
 */
interface WorkflowExecutionState {
  /** Whether workflow is currently executing */
  isExecuting: boolean;
  /** Main workflow job ID */
  jobId: string | null;
  /** Error message if execution failed */
  error: string | null;
  /** Status of each node by node ID */
  nodeStatuses: Record<string, NodeExecutionStatus>;
  /** Execution info (timing) for each node by node ID */
  nodeExecutionInfo: Record<string, NodeExecutionInfo>;
  /** Temp layer IDs by node ID (for displaying results) */
  tempLayerIds: Record<string, string>;
  /** Exported (permanent) layer IDs by export node ID */
  exportedLayerIds: Record<string, string>;
  /** Layer style properties by node ID (from tool results) */
  tempLayerProperties: Record<string, Record<string, unknown>>;
}

/**
 * Result from a completed workflow node
 */
interface NodeResult {
  node_id: string;
  temp_layer_id?: string;
  layer_id?: string;
  status?: string;
  error?: string;
  duration_ms?: number; // Execution duration in milliseconds
  properties?: Record<string, unknown>; // Layer style properties from tool
}

/**
 * Props for useWorkflowExecution hook
 */
interface UseWorkflowExecutionProps {
  workflow?: { id: string; config?: unknown };
  projectId?: string;
  folderId?: string;
}

/**
 * Hook for managing workflow execution via Windmill
 */
export function useWorkflowExecution({ workflow, projectId, folderId }: UseWorkflowExecutionProps) {
  const { t } = useTranslation("common");
  const dispatch = useDispatch<AppDispatch>();

  // Derive workflowId from prop
  const workflowId = workflow?.id;

  // Redux state
  const nodes = useSelector(selectNodes);
  const edges = useSelector(selectEdges);
  const variables = useSelector(selectVariables);
  const runningJobIds = useAppSelector((state) => state.jobs.runningJobIds);

  // Keep ref to runningJobIds to avoid dependency issues
  const runningJobIdsRef = useRef(runningJobIds);
  runningJobIdsRef.current = runningJobIds;

  // Track which job IDs have been processed to prevent duplicate toast messages
  const processedJobIdsRef = useRef<Set<string>>(new Set());

  // Track whether we've already attempted to reconnect to a running job
  const reconnectedRef = useRef<string | null>(null);

  // Jobs polling
  const { jobs, mutate: mutateJobs } = useJobs({ read: false });

  // Execution state
  const [state, setState] = useState<WorkflowExecutionState>({
    isExecuting: false,
    jobId: null,
    error: null,
    nodeStatuses: {},
    nodeExecutionInfo: {},
    tempLayerIds: {},
    exportedLayerIds: {},
    tempLayerProperties: {},
  });

  /**
   * Reconnect to a running workflow job on mount/navigation.
   * After refresh or switching workflows, the local state is empty but there may be
   * an active (running/accepted) workflow_runner job for this workflow on the server.
   * This effect detects that and restores the execution state so that the UI shows
   * the correct running animation, node statuses, and disables the Run button.
   */
  useEffect(() => {
    // Only attempt reconnection if we're not already executing and have a workflowId
    if (state.isExecuting || !workflowId || !jobs?.jobs) return;

    // Don't reconnect to the same workflow twice (prevents loops)
    if (reconnectedRef.current === workflowId) return;

    // Find an active workflow_runner job for this specific workflow
    const activeJob = jobs.jobs.find(
      (j) =>
        j.processID === "workflow_runner" &&
        (j.status === "running" || j.status === "accepted") &&
        (j.inputs as Record<string, unknown>)?.workflow_id === workflowId
    );

    if (!activeJob) return;

    reconnectedRef.current = workflowId;

    // Initialize node statuses from the job's node_status if available
    const initialStatuses: Record<string, NodeExecutionStatus> = {};
    const initialExecutionInfo: Record<string, NodeExecutionInfo> = {};
    const initialTempLayerIds: Record<string, string> = {};

    // First, set all tool/export nodes to pending
    nodes.forEach((node) => {
      if (node.data?.type === "tool" || node.data?.type === "export") {
        initialStatuses[node.id] = "pending";
        initialExecutionInfo[node.id] = { status: "pending" };
      }
    });

    // Then overlay with actual status from the job
    if (activeJob.node_status) {
      Object.entries(activeJob.node_status).forEach(([nodeId, statusData]) => {
        if (initialStatuses[nodeId] !== undefined) {
          if (typeof statusData === "string") {
            initialStatuses[nodeId] = statusData as NodeExecutionStatus;
            initialExecutionInfo[nodeId] = { status: statusData as NodeExecutionStatus };
          } else {
            initialStatuses[nodeId] = statusData.status;
            initialExecutionInfo[nodeId] = {
              status: statusData.status,
              startedAt: statusData.started_at,
              durationMs: statusData.duration_ms,
            };
            if (statusData.temp_layer_id) {
              initialTempLayerIds[nodeId] = statusData.temp_layer_id;
            }
          }
        }
      });
    } else if (activeJob.workflow_as_code_status) {
      const { running = [], completed = [] } = activeJob.workflow_as_code_status;
      const extractNodeId = (taskName: string): string => {
        return taskName.replace("run_tool_", "").replace(/_/g, "-");
      };
      running.forEach((taskName: string) => {
        const nodeId = extractNodeId(taskName);
        if (initialStatuses[nodeId]) initialStatuses[nodeId] = "running";
      });
      completed.forEach((taskName: string) => {
        const nodeId = extractNodeId(taskName);
        if (initialStatuses[nodeId]) initialStatuses[nodeId] = "completed";
      });
    }

    setState({
      isExecuting: true,
      jobId: activeJob.jobID,
      error: null,
      nodeStatuses: initialStatuses,
      nodeExecutionInfo: initialExecutionInfo,
      tempLayerIds: initialTempLayerIds,
      exportedLayerIds: {},
      tempLayerProperties: {},
    });

    // Ensure the job is in the Redux running jobs list for polling
    if (!runningJobIdsRef.current.includes(activeJob.jobID)) {
      dispatch(setRunningJobIds([...runningJobIdsRef.current, activeJob.jobID]));
    }
  }, [workflowId, jobs, state.isExecuting, nodes, dispatch]);

  /**
   * Check if workflow can be executed
   */
  const canExecute = useMemo(() => {
    if (!projectId || !workflowId) return false;
    if (state.isExecuting) return false;

    // Must have at least one tool node
    const hasToolNodes = nodes.some((n) => n.data?.type === "tool");
    return hasToolNodes;
  }, [projectId, workflowId, state.isExecuting, nodes]);

  /**
   * Execute the workflow
   */
  const execute = useCallback(async () => {
    if (!projectId || !workflowId || !folderId) {
      toast.error(t("workflow_missing_context"));
      return;
    }

    // Clear processed job IDs for new execution
    processedJobIdsRef.current.clear();

    // Initialize node statuses to pending (waiting to be executed)
    const initialStatuses: Record<string, NodeExecutionStatus> = {};
    const initialExecutionInfo: Record<string, NodeExecutionInfo> = {};
    nodes.forEach((node) => {
      if (node.data?.type === "tool" || node.data?.type === "export") {
        initialStatuses[node.id] = "pending";
        initialExecutionInfo[node.id] = { status: "pending" };
      }
    });

    setState((s) => ({
      ...s,
      isExecuting: true,
      error: null,
      nodeStatuses: initialStatuses,
      nodeExecutionInfo: initialExecutionInfo,
      tempLayerIds: {},
      exportedLayerIds: {},
      tempLayerProperties: {},
    }));

    try {
      // Cleanup previous temp files
      await cleanupWorkflowTemp(workflowId);

      // Build execution request
      const request: WorkflowExecuteRequest = {
        project_id: projectId,
        folder_id: folderId,
        nodes: nodes,
        edges: edges,
        ...(variables.length > 0 && {
          variables: variables.map((v) => ({
            name: v.name,
            type: v.type,
            defaultValue: v.defaultValue,
          })),
        }),
      };

      // Submit to Windmill
      const response = await executeWorkflow(workflowId, request);
      setState((s) => ({ ...s, jobId: response.job_id }));

      // Add to running jobs for polling (use ref to avoid stale closure)
      dispatch(setRunningJobIds([...runningJobIdsRef.current, response.job_id]));

      // Trigger immediate fetch
      mutateJobs();

      toast.dismiss();
      toast.success(t("workflow_started"));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Execution failed";
      setState((s) => ({
        ...s,
        isExecuting: false,
        error: message,
        nodeStatuses: {},
      }));
      toast.dismiss();
      toast.error(`${t("workflow_failed")}: ${message}`);
    }
  }, [projectId, workflowId, folderId, nodes, edges, variables, dispatch, mutateJobs, t]);

  /**
   * Finalize a node's temp layer to permanent storage
   */
  const finalizeNode = useCallback(
    async (nodeId: string, layerName?: string) => {
      if (!workflowId || !projectId) {
        toast.error(t("workflow_missing_context"));
        return null;
      }

      try {
        const response = await finalizeWorkflowLayer(workflowId, {
          workflow_id: workflowId,
          node_id: nodeId,
          project_id: projectId,
          layer_name: layerName,
        });

        // Add finalize job to tracking (use ref to avoid stale closure)
        dispatch(setRunningJobIds([...runningJobIdsRef.current, response.job_id]));
        mutateJobs();

        toast.info(t("saving_layer"));
        return response.job_id;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Save failed";
        toast.error(`${t("save_failed")}: ${message}`);
        return null;
      }
    },
    [workflowId, projectId, dispatch, mutateJobs, t]
  );

  /**
   * Watch job status and update node statuses
   */
  useEffect(() => {
    if (!state.jobId || !jobs?.jobs) return;

    const job = jobs.jobs.find((j) => j.jobID === state.jobId);
    if (!job) return;

    // When job is running, show first pending node as running
    if (job.status === "running" || job.status === "accepted") {
      // If we have node_status from flow_user_state, use it for accurate per-node tracking
      if (job.node_status) {
        setState((prev) => {
          const newStatuses = { ...prev.nodeStatuses };
          const newExecutionInfo = { ...prev.nodeExecutionInfo };
          const newTempLayerIds = { ...prev.tempLayerIds };

          // Copy node statuses, execution info, and temp layer IDs from job
          Object.entries(job.node_status!).forEach(([nodeId, statusData]) => {
            if (newStatuses[nodeId] !== undefined) {
              // Handle both old format (string) and new format (object with status/timing)
              if (typeof statusData === "string") {
                newStatuses[nodeId] = statusData as NodeExecutionStatus;
                newExecutionInfo[nodeId] = { status: statusData as NodeExecutionStatus };
              } else {
                newStatuses[nodeId] = statusData.status;
                newExecutionInfo[nodeId] = {
                  status: statusData.status,
                  startedAt: statusData.started_at,
                  durationMs: statusData.duration_ms,
                };
                // Extract temp_layer_id for completed nodes
                if (statusData.temp_layer_id) {
                  newTempLayerIds[nodeId] = statusData.temp_layer_id;
                }
              }
            }
          });

          return {
            ...prev,
            nodeStatuses: newStatuses,
            nodeExecutionInfo: newExecutionInfo,
            tempLayerIds: newTempLayerIds,
          };
        });
      } else if (job.workflow_as_code_status) {
        // Fallback: use workflow_as_code_status if available
        const { running = [], completed = [] } = job.workflow_as_code_status;

        setState((prev) => {
          const newStatuses = { ...prev.nodeStatuses };

          // Helper to extract node_id from task name
          // Task names are like "run_tool_{node_id}" where hyphens are replaced with underscores
          const extractNodeId = (taskName: string): string => {
            const safeId = taskName.replace("run_tool_", "");
            // Convert underscores back to hyphens to match original node IDs
            // Node IDs are UUIDs with hyphens like "tool-4e1e1f0e-ca5e-4dc1-ae01-f77e1b0134b2"
            return safeId.replace(/_/g, "-");
          };

          // Mark running nodes
          running.forEach((taskName: string) => {
            const nodeId = extractNodeId(taskName);
            if (newStatuses[nodeId]) {
              newStatuses[nodeId] = "running";
            }
          });

          // Mark completed nodes
          completed.forEach((taskName: string) => {
            const nodeId = extractNodeId(taskName);
            if (newStatuses[nodeId]) {
              newStatuses[nodeId] = "completed";
            }
          });

          return { ...prev, nodeStatuses: newStatuses };
        });
      } else {
        // Last fallback: show first pending node as running when no status available
        setState((prev) => {
          const newStatuses = { ...prev.nodeStatuses };

          // Find the first pending node and mark it as running
          const pendingNodes = Object.entries(newStatuses)
            .filter(([, status]) => status === "pending")
            .map(([nodeId]) => nodeId);

          if (pendingNodes.length > 0) {
            const hasRunningNode = Object.values(newStatuses).some((s) => s === "running");
            if (!hasRunningNode) {
              newStatuses[pendingNodes[0]] = "running";
            }
          }

          return { ...prev, nodeStatuses: newStatuses };
        });
      }
    }

    // Check for completion - but only process each job once
    if (job.status === "successful") {
      // Skip if we've already processed this job completion
      if (processedJobIdsRef.current.has(job.jobID)) {

        return;
      }
      processedJobIdsRef.current.add(job.jobID);

      const results = job.result?.node_results as Record<string, NodeResult> | undefined;
      const tempLayerIds: Record<string, string> = {};
      const exportedLayerIds: Record<string, string> = {};
      const tempLayerProperties: Record<string, Record<string, unknown>> = {};

      // Build execution info with timing from node_results
      const finalExecutionInfo: Record<string, NodeExecutionInfo> = {};

      if (results) {
        Object.entries(results).forEach(([nodeId, result]) => {
          if (result.temp_layer_id) {
            tempLayerIds[nodeId] = result.temp_layer_id;
          }
          // Export nodes return layer_id (permanent) instead of temp_layer_id
          if (result.layer_id) {
            exportedLayerIds[nodeId] = result.layer_id;
          }
          // Extract layer style properties from tool results
          if (result.properties) {
            tempLayerProperties[nodeId] = result.properties;
          }
          // Extract timing info from each node result
          finalExecutionInfo[nodeId] = {
            status: "completed",
            durationMs: result.duration_ms,
          };
        });
      }

      setState((s) => ({
        ...s,
        isExecuting: false,
        jobId: null, // Clear jobId to prevent re-triggering on subsequent job list updates
        tempLayerIds,
        exportedLayerIds,
        tempLayerProperties,
        nodeStatuses: Object.fromEntries(
          Object.entries(s.nodeStatuses).map(([id, _status]) => [id, "completed"])
        ),
        // Set final execution info with timing from node_results
        nodeExecutionInfo: finalExecutionInfo,
      }));

      // Remove from running jobs - use ref to get current value
      dispatch(setRunningJobIds(runningJobIdsRef.current.filter((id) => id !== state.jobId)));

      // Allow reconnection if the same workflow is run again
      reconnectedRef.current = null;

      toast.dismiss();
      toast.success(t("workflow_completed"));
    } else if (job.status === "failed") {
      // Skip if we've already processed this job failure
      if (processedJobIdsRef.current.has(job.jobID)) {

        return;
      }
      processedJobIdsRef.current.add(job.jobID);

      setState((s) => {
        // Update node statuses: mark running nodes as failed, keep completed ones as completed
        const newStatuses = { ...s.nodeStatuses };
        const newTempLayerIds = { ...s.tempLayerIds };

        Object.entries(newStatuses).forEach(([nodeId, status]) => {
          if (status === "running" || status === "pending") {
            newStatuses[nodeId] = "failed";
          }
        });

        // Extract temp_layer_ids from node_status for completed nodes (so we can view their data)
        if (job.node_status) {
          Object.entries(job.node_status).forEach(([nodeId, statusData]) => {
            if (typeof statusData !== "string" && statusData.temp_layer_id) {
              newTempLayerIds[nodeId] = statusData.temp_layer_id;
            }
          });
        }

        return {
          ...s,
          isExecuting: false,
          jobId: null, // Clear jobId to prevent re-triggering on subsequent job list updates
          error: job.message || "Workflow failed",
          nodeStatuses: newStatuses,
          tempLayerIds: newTempLayerIds,
        };
      });

      // Remove from running jobs
      dispatch(setRunningJobIds(runningJobIdsRef.current.filter((id) => id !== state.jobId)));

      // Allow reconnection if the same workflow is run again
      reconnectedRef.current = null;

      toast.dismiss();
      toast.error(`${t("workflow_failed")}: ${job.message || "Unknown error"}`);
    }
    // Note: Intentionally excluding runningJobIds from deps to avoid infinite loop
    // The dispatch only happens on job completion which happens once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs, state.jobId, dispatch, t]);

  // Note: No manual polling interval needed here.
  // Export nodes are finalized server-side by the workflow_runner.
  // The useJobs hook already has built-in SWR refreshInterval
  // that polls every 2 seconds when there are active jobs.

  /**
   * Cancel/stop the running workflow
   */
  const cancel = useCallback(async () => {
    if (!state.jobId) return;

    try {
      await dismissJob(state.jobId);

      // Update state to show cancelled
      setState((s) => {
        const newStatuses = { ...s.nodeStatuses };
        Object.entries(newStatuses).forEach(([nodeId, status]) => {
          if (status === "running" || status === "pending") {
            newStatuses[nodeId] = "failed";
          }
        });

        return {
          ...s,
          isExecuting: false,
          error: "Workflow cancelled",
          nodeStatuses: newStatuses,
        };
      });

      // Remove from running jobs
      dispatch(setRunningJobIds(runningJobIdsRef.current.filter((id) => id !== state.jobId)));

      // Allow reconnection if the same workflow is run again
      reconnectedRef.current = null;

      toast.dismiss();
      toast.warning(t("workflow_cancelled"));
    } catch (error) {
      console.error("Failed to cancel workflow:", error);
      toast.error(t("workflow_cancel_failed"));
    }
  }, [state.jobId, dispatch, t]);

  /**
   * Reset execution state
   */
  const reset = useCallback(() => {
    reconnectedRef.current = null;
    setState({
      isExecuting: false,
      jobId: null,
      error: null,
      nodeStatuses: {},
      nodeExecutionInfo: {},
      tempLayerIds: {},
      exportedLayerIds: {},
      tempLayerProperties: {},
    });
  }, []);

  return {
    // State
    isExecuting: state.isExecuting,
    jobId: state.jobId,
    error: state.error,
    nodeStatuses: state.nodeStatuses,
    nodeExecutionInfo: state.nodeExecutionInfo,
    tempLayerIds: state.tempLayerIds,
    exportedLayerIds: state.exportedLayerIds,
    tempLayerProperties: state.tempLayerProperties,

    // Actions
    execute,
    cancel,
    finalizeNode,
    reset,
    canExecute,
  };
}
