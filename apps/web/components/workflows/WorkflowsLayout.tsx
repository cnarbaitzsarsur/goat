"use client";

import { Box, useTheme } from "@mui/material";
import { ReactFlowProvider, useReactFlow } from "@xyflow/react";
import React, { useCallback, useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { v4 as uuidv4 } from "uuid";

import { updateWorkflow as updateWorkflowApi, useWorkflows } from "@/lib/api/workflows";
import type { AppDispatch } from "@/lib/store";
import {
  selectEdges,
  selectIsDirty,
  selectNodes,
  selectSelectedNodeId,
  selectSelectedWorkflow,
  selectSelectedWorkflowId,
  selectViewport,
} from "@/lib/store/workflow/selectors";
import {
  addNode,
  markSaved,
  selectWorkflow,
  setWorkflows,
  syncToWorkflowConfig,
} from "@/lib/store/workflow/slice";
import type { Project, ProjectLayer } from "@/lib/validations/project";

import WorkflowCanvas from "@/components/workflows/canvas/WorkflowCanvas";
import WorkflowsConfigPanel from "@/components/workflows/panels/WorkflowsConfigPanel";
import WorkflowsNodesPanel from "@/components/workflows/panels/WorkflowsNodesPanel";

export interface WorkflowsLayoutProps {
  project?: Project;
  projectLayers?: ProjectLayer[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onProjectUpdate?: (key: string, value: any, refresh?: boolean) => void;
}

/**
 * Inner component that has access to ReactFlow context
 */
const WorkflowsLayoutInner: React.FC<WorkflowsLayoutProps> = ({
  project,
  projectLayers = [],
  onProjectUpdate: _onProjectUpdate,
}) => {
  const theme = useTheme();
  const dispatch = useDispatch<AppDispatch>();
  const reactFlowInstance = useReactFlow();

  // Redux state
  const selectedWorkflowId = useSelector(selectSelectedWorkflowId);
  const selectedWorkflow = useSelector(selectSelectedWorkflow);
  const selectedNodeId = useSelector(selectSelectedNodeId);
  const nodes = useSelector(selectNodes);
  const edges = useSelector(selectEdges);
  const viewport = useSelector(selectViewport);
  const isDirty = useSelector(selectIsDirty);

  // Ref to track drag data
  const dragDataRef = useRef<{ nodeType: string; toolId?: string; layerId?: string } | null>(null);

  // Ref for save timeout
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch workflows from API
  const { workflows, mutate: mutateWorkflows } = useWorkflows(project?.id);

  // Sync workflows from API to Redux
  useEffect(() => {
    if (workflows) {
      dispatch(setWorkflows(workflows));
    }
  }, [workflows, dispatch]);

  // Auto-save when dirty (debounced)
  useEffect(() => {
    if (!isDirty || !selectedWorkflow || !project?.id) return;

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Debounce save by 1 second
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        // Sync current state to workflow config
        dispatch(syncToWorkflowConfig());

        // Build config from current state with proper typing
        const config: typeof selectedWorkflow.config = {
          ...selectedWorkflow.config,
          nodes: nodes.map((node) => ({
            id: node.id,
            type: node.type as "dataset" | "tool",
            position: node.position,
            data: node.data as (typeof selectedWorkflow.config.nodes)[number]["data"],
          })),
          edges: edges.map((edge) => ({
            id: edge.id,
            source: edge.source,
            sourceHandle: edge.sourceHandle || undefined,
            target: edge.target,
            targetHandle: edge.targetHandle || undefined,
          })),
          viewport,
        };

        await updateWorkflowApi(project.id, selectedWorkflow.id, { config });
        dispatch(markSaved());
        mutateWorkflows();
      } catch (error) {
        console.error("Failed to save workflow:", error);
      }
    }, 1000);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [isDirty, selectedWorkflow, project?.id, nodes, edges, viewport, dispatch, mutateWorkflows]);

  // Handle workflow selection (from config panel)
  // Only dispatch if the ID actually changes to avoid clearing selectedNodeId
  const handleSelectWorkflow = useCallback(
    (workflow: { id: string } | null) => {
      const newId = workflow?.id ?? null;
      if (newId !== selectedWorkflowId) {
        dispatch(selectWorkflow(newId));
      }
    },
    [dispatch, selectedWorkflowId]
  );

  // Handle drag start from nodes panel
  const handleDragStart = useCallback(
    (event: React.DragEvent, nodeType: string, toolId?: string, _layerId?: string) => {
      dragDataRef.current = { nodeType, toolId };
      event.dataTransfer.setData("application/reactflow", nodeType);
      event.dataTransfer.effectAllowed = "move";
    },
    []
  );

  // Handle drag over canvas
  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  // Handle drop on canvas
  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      if (!selectedWorkflowId || !dragDataRef.current || !reactFlowInstance) return;

      const { nodeType, toolId } = dragDataRef.current;
      dragDataRef.current = null;

      // Get canvas position from drop coordinates
      const reactFlowBounds = event.currentTarget.getBoundingClientRect();
      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX - reactFlowBounds.left,
        y: event.clientY - reactFlowBounds.top,
      });

      if (nodeType === "dataset") {
        dispatch(
          addNode({
            id: `dataset-${uuidv4()}`,
            type: "dataset",
            position,
            data: {
              type: "dataset",
              label: "Dataset",
            },
          })
        );
      } else if (nodeType === "tool" && toolId) {
        dispatch(
          addNode({
            id: `tool-${uuidv4()}`,
            type: "tool",
            position,
            data: {
              type: "tool",
              label: toolId,
              processId: toolId,
              config: {},
              status: "idle",
            },
          })
        );
      }
    },
    [selectedWorkflowId, reactFlowInstance, dispatch]
  );

  return (
    <Box
      sx={{
        display: "flex",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        backgroundColor: theme.palette.background.default,
      }}>
      {/* Left Panel - Workflow list */}
      <WorkflowsConfigPanel
        project={project}
        selectedWorkflow={selectedWorkflow ?? null}
        onSelectWorkflow={handleSelectWorkflow}
      />

      {/* Center - Canvas */}
      <Box
        sx={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
          height: "100%",
          overflow: "hidden",
        }}>
        <WorkflowCanvas onDrop={handleDrop} onDragOver={handleDragOver} />
      </Box>

      {/* Right Panel - Tools palette & Node Settings */}
      <WorkflowsNodesPanel
        config={selectedWorkflow?.config || null}
        selectedNodeId={selectedNodeId}
        projectLayers={projectLayers}
        workflowId={selectedWorkflow?.id}
        onDragStart={handleDragStart}
      />
    </Box>
  );
};

/**
 * Main WorkflowsLayout component wrapped with ReactFlowProvider
 */
const WorkflowsLayout: React.FC<WorkflowsLayoutProps> = (props) => {
  return (
    <ReactFlowProvider>
      <WorkflowsLayoutInner {...props} />
    </ReactFlowProvider>
  );
};

export default WorkflowsLayout;
