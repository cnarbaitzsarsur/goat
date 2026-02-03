"use client";

import React, { type ReactNode, createContext, useContext } from "react";

export type NodeExecutionStatus = "pending" | "running" | "completed" | "failed";

export interface NodeExecutionInfo {
  status: NodeExecutionStatus;
  startedAt?: number; // Unix timestamp in seconds
  durationMs?: number; // Duration in milliseconds (set when completed)
}

interface WorkflowExecutionContextValue {
  isExecuting: boolean;
  nodeStatuses: Record<string, NodeExecutionStatus>;
  nodeExecutionInfo: Record<string, NodeExecutionInfo>;
  tempLayerIds: Record<string, string>;
  onSaveNode?: (nodeId: string, layerName?: string) => Promise<string | null>;
}

const WorkflowExecutionContext = createContext<WorkflowExecutionContextValue>({
  isExecuting: false,
  nodeStatuses: {},
  nodeExecutionInfo: {},
  tempLayerIds: {},
});

export interface WorkflowExecutionProviderProps {
  children: ReactNode;
  isExecuting: boolean;
  nodeStatuses: Record<string, NodeExecutionStatus>;
  nodeExecutionInfo: Record<string, NodeExecutionInfo>;
  tempLayerIds: Record<string, string>;
  onSaveNode?: (nodeId: string, layerName?: string) => Promise<string | null>;
}

export const WorkflowExecutionProvider: React.FC<WorkflowExecutionProviderProps> = ({
  children,
  isExecuting,
  nodeStatuses,
  nodeExecutionInfo,
  tempLayerIds,
  onSaveNode,
}) => {
  return (
    <WorkflowExecutionContext.Provider
      value={{ isExecuting, nodeStatuses, nodeExecutionInfo, tempLayerIds, onSaveNode }}>
      {children}
    </WorkflowExecutionContext.Provider>
  );
};

export const useWorkflowExecutionContext = (): WorkflowExecutionContextValue => {
  return useContext(WorkflowExecutionContext);
};
