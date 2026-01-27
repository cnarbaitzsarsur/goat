import useSWR from "swr";

import { apiRequestAuth, fetcher } from "@/lib/api/fetcher";
import type { Workflow, WorkflowCreate, WorkflowUpdate } from "@/lib/validations/workflow";

import { PROJECTS_API_BASE_URL } from "./projects";

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
