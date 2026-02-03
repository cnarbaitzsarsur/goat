import useSWR from "swr";

import { apiRequestAuth, fetcher } from "@/lib/api/fetcher";
import { PROCESSES_BASE_URL } from "@/lib/constants";
// ============================================================================
// Temp Layer Data API (for workflow preview)
// ============================================================================
import { GEOAPI_BASE_URL } from "@/lib/constants";
import type { Workflow, WorkflowCreate, WorkflowUpdate } from "@/lib/validations/workflow";

import { PROJECTS_API_BASE_URL } from "./projects";

// Workflows API on Processes service
const WORKFLOWS_API_BASE_URL = `${PROCESSES_BASE_URL}/workflows`;

// Types for Workflow Execution

export interface WorkflowExecuteRequest {
  project_id: string;
  folder_id: string;
  nodes: unknown[];
  edges: unknown[];
}

export interface WorkflowExecuteResponse {
  job_id: string;
  workflow_id: string;
  status: string;
}

export interface WorkflowFinalizeRequest {
  workflow_id: string;
  node_id: string;
  project_id: string;
  layer_name?: string;
}

export interface WorkflowFinalizeResponse {
  job_id: string;
}

export interface WorkflowCleanupResponse {
  status: string;
  message: string;
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Fetch all workflows for a project
 */
export const useWorkflows = (projectId?: string) => {
  const { data, isLoading, error, mutate, isValidating } = useSWR<Workflow[]>(
    () => (projectId ? [`${PROJECTS_API_BASE_URL}/${projectId}/workflow`] : null),
    fetcher
  );

  return {
    workflows: data,
    isLoading,
    isError: error,
    mutate,
    isValidating,
  };
};

/**
 * Fetch a specific workflow
 */
export const useWorkflow = (projectId?: string, workflowId?: string) => {
  const { data, isLoading, error, mutate, isValidating } = useSWR<Workflow>(
    () => (projectId && workflowId ? [`${PROJECTS_API_BASE_URL}/${projectId}/workflow/${workflowId}`] : null),
    fetcher
  );

  return {
    workflow: data,
    isLoading,
    isError: error,
    mutate,
    isValidating,
  };
};

// ============================================================================
// API Functions
// ============================================================================

/**
 * Create a new workflow
 */
export const createWorkflow = async (projectId: string, workflow: WorkflowCreate): Promise<Workflow> => {
  const response = await apiRequestAuth(`${PROJECTS_API_BASE_URL}/${projectId}/workflow`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(workflow),
  });
  if (!response.ok) {
    throw new Error("Failed to create workflow");
  }
  return await response.json();
};

/**
 * Update an existing workflow
 */
export const updateWorkflow = async (
  projectId: string,
  workflowId: string,
  workflow: WorkflowUpdate
): Promise<Workflow> => {
  const response = await apiRequestAuth(`${PROJECTS_API_BASE_URL}/${projectId}/workflow/${workflowId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(workflow),
  });
  if (!response.ok) {
    throw new Error("Failed to update workflow");
  }
  return await response.json();
};

/**
 * Delete a workflow
 */
export const deleteWorkflow = async (projectId: string, workflowId: string): Promise<void> => {
  const response = await apiRequestAuth(`${PROJECTS_API_BASE_URL}/${projectId}/workflow/${workflowId}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error("Failed to delete workflow");
  }
};

/**
 * Duplicate a workflow
 */
export const duplicateWorkflow = async (
  projectId: string,
  workflowId: string,
  newName?: string
): Promise<Workflow> => {
  let url = `${PROJECTS_API_BASE_URL}/${projectId}/workflow/${workflowId}/duplicate`;
  if (newName) {
    url += `?new_name=${encodeURIComponent(newName)}`;
  }
  const response = await apiRequestAuth(url, {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error("Failed to duplicate workflow");
  }
  return await response.json();
};

// ============================================================================
// Workflow Execution API Functions
// ============================================================================

/**
 * Execute a workflow via Windmill
 */
export const executeWorkflow = async (
  workflowId: string,
  request: WorkflowExecuteRequest
): Promise<WorkflowExecuteResponse> => {
  const response = await apiRequestAuth(`${WORKFLOWS_API_BASE_URL}/${workflowId}/execute`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to execute workflow: ${error}`);
  }
  return await response.json();
};

/**
 * Finalize a temporary workflow layer (save to permanent storage)
 */
export const finalizeWorkflowLayer = async (
  workflowId: string,
  request: WorkflowFinalizeRequest
): Promise<WorkflowFinalizeResponse> => {
  const response = await apiRequestAuth(`${WORKFLOWS_API_BASE_URL}/${workflowId}/finalize`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to finalize layer: ${error}`);
  }
  return await response.json();
};

/**
 * Cleanup temporary workflow files
 */
export const cleanupWorkflowTemp = async (
  workflowId: string,
  nodeIds?: string[]
): Promise<WorkflowCleanupResponse> => {
  let url = `${WORKFLOWS_API_BASE_URL}/${workflowId}/temp`;
  if (nodeIds && nodeIds.length > 0) {
    url += `?node_ids=${nodeIds.join(",")}`;
  }
  const response = await apiRequestAuth(url, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error("Failed to cleanup temp files");
  }
  return await response.json();
};

// ============================================================================

// ============================================================================

export interface TempLayerMetadata {
  layer_name: string;
  geometry_type: string | null;
  feature_count: number;
  bbox: number[] | null;
  columns: Record<string, string>;
  workflow_id: string;
  node_id: string;
}

export interface TempLayerFeaturesResponse {
  type: "FeatureCollection";
  features: unknown[];
  numberMatched?: number;
  numberReturned?: number;
}

/**
 * Fetch temp layer features (GeoJSON) using the standard features endpoint
 * with temp=true query param
 */
export const getTempLayerFeatures = async (
  layerId: string,
  params?: { limit?: number; offset?: number }
): Promise<TempLayerFeaturesResponse> => {
  const searchParams = new URLSearchParams();
  searchParams.set("temp", "true");
  if (params?.limit) searchParams.set("limit", String(params.limit));
  if (params?.offset) searchParams.set("offset", String(params.offset));

  const url = `${GEOAPI_BASE_URL}/collections/${layerId}/items?${searchParams.toString()}`;

  const response = await apiRequestAuth(url);
  if (!response.ok) {
    throw new Error("Failed to fetch temp layer features");
  }
  return await response.json();
};

/**
 * Hook to fetch temp layer features with SWR
 * URL format: /collections/{layer_uuid}/items?temp=true
 */
export const useTempLayerFeatures = (
  layerId: string | undefined,
  params?: { limit?: number; offset?: number }
) => {
  const searchParams = new URLSearchParams();
  searchParams.set("temp", "true");
  if (params?.limit) searchParams.set("limit", String(params.limit));
  if (params?.offset) searchParams.set("offset", String(params.offset));

  const url = layerId ? `${GEOAPI_BASE_URL}/collections/${layerId}/items?${searchParams.toString()}` : null;

  const { data, isLoading, error, mutate } = useSWR<TempLayerFeaturesResponse>(url ? [url] : null, fetcher);

  return {
    data,
    isLoading,
    isError: error,
    mutate,
  };
};
