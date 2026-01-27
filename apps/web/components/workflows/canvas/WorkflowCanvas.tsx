"use client";

import { AccountTree as WorkflowIcon } from "@mui/icons-material";
import { Box, Typography, useTheme } from "@mui/material";
import { styled } from "@mui/material/styles";
import {
  Background,
  BackgroundVariant,
  type Connection,
  Controls,
  type Edge,
  type EdgeTypes,
  MiniMap,
  type Node,
  type NodeTypes,
  type OnConnect,
  type OnEdgesChange,
  type OnNodesChange,
  ReactFlow,
  type ReactFlowInstance,
  type Viewport,
  useEdgesState,
  useNodesState,
  useOnSelectionChange,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDispatch, useSelector } from "react-redux";
import { v4 as uuidv4 } from "uuid";

import type { AppDispatch } from "@/lib/store";
import {
  selectEdges,
  selectNodes,
  selectSelectedNodeId,
  selectSelectedWorkflowId,
  selectViewport,
} from "@/lib/store/workflow/selectors";
import {
  addEdge as addEdgeAction,
  addNode,
  removeEdges,
  removeNodes,
  selectNode,
  updateNodePositions,
  updateViewport,
} from "@/lib/store/workflow/slice";
import type { WorkflowNode } from "@/lib/validations/workflow";
import { createTextAnnotationNode } from "@/lib/validations/workflow";

import { useConnectionValidator, useWorkflowProcessDescriptions } from "@/hooks/map/useConnectionValidation";
import { useWorkflowHistory } from "@/hooks/workflows/useWorkflowHistory";

import DeletableEdge from "../edges/DeletableEdge";
import DatasetNode from "../nodes/DatasetNode";
import TextAnnotationNode from "../nodes/TextAnnotationNode";
import ToolNode from "../nodes/ToolNode";
import CanvasToolbar from "./CanvasToolbar";

const CanvasContainer = styled(Box)(({ theme }) => ({
  flex: 1,
  height: "100%",
  position: "relative",
  backgroundColor: theme.palette.background.default,
  "& .react-flow__attribution": {
    display: "none",
  },
  // Dark theme styling for ReactFlow controls
  "& .react-flow__controls": {
    backgroundColor: theme.palette.background.paper,
    borderRadius: "4px",
    border: `1px solid ${theme.palette.divider}`,
    boxShadow: "none",
  },
  "& .react-flow__controls-button": {
    backgroundColor: theme.palette.background.paper,
    borderBottom: `1px solid ${theme.palette.divider}`,
    "&:hover": {
      backgroundColor: theme.palette.action.hover,
    },
    "& svg": {
      fill: theme.palette.text.primary,
    },
  },
  // Dark theme styling for MiniMap
  "& .react-flow__minimap": {
    backgroundColor: theme.palette.background.paper,
    borderRadius: "4px",
    border: `1px solid ${theme.palette.divider}`,
  },
}));

const EmptyState = styled(Box)(({ theme }) => ({
  position: "absolute",
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: theme.spacing(1),
  color: theme.palette.text.secondary,
  pointerEvents: "none",
}));

const EmptyStateCard = styled(Box)(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: theme.spacing(1.5),
  padding: theme.spacing(4),
  backgroundColor: theme.palette.background.paper,
  borderRadius: theme.shape.borderRadius * 2,
  border: `1px dashed ${theme.palette.divider}`,
  maxWidth: 320,
  textAlign: "center",
}));

const EmptyStateIconWrapper = styled(Box)(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 64,
  height: 64,
  borderRadius: theme.shape.borderRadius,
  backgroundColor: theme.palette.action.hover,
  color: theme.palette.text.secondary,
}));

// Custom node types for ReactFlow
const nodeTypes: NodeTypes = {
  dataset: DatasetNode,
  tool: ToolNode,
  textAnnotation: TextAnnotationNode,
};

// Custom edge types for ReactFlow
const edgeTypes: EdgeTypes = {
  deletable: DeletableEdge,
};

interface WorkflowCanvasProps {
  onDrop: (event: React.DragEvent) => void;
  onDragOver: (event: React.DragEvent) => void;
}

const WorkflowCanvas: React.FC<WorkflowCanvasProps> = ({ onDrop, onDragOver }) => {
  const { t } = useTranslation("common");
  const theme = useTheme();
  const dispatch = useDispatch<AppDispatch>();
  const { setViewport, screenToFlowPosition } = useReactFlow();

  // Canvas tool state
  const [activeTool, setActiveTool] = useState<"select" | "text">("select");

  // Drawing state for text annotation
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [drawRect, setDrawRect] = useState<{ x: number; y: number; width: number; height: number } | null>(
    null
  );

  // Undo/Redo history
  const { canUndo, canRedo, undo, redo } = useWorkflowHistory();

  // Get state from Redux
  const reduxNodes = useSelector(selectNodes);
  const reduxEdges = useSelector(selectEdges);
  const selectedWorkflowId = useSelector(selectSelectedWorkflowId);
  const selectedNodeId = useSelector(selectSelectedNodeId);
  const reduxViewport = useSelector(selectViewport);

  // Get process descriptions for connection validation
  const workflowNodes = useMemo(() => reduxNodes as WorkflowNode[], [reduxNodes]);
  const processMap = useWorkflowProcessDescriptions(workflowNodes);
  const validateConnection = useConnectionValidator(workflowNodes, processMap);

  // Local ReactFlow state for smooth dragging
  const [localNodes, setLocalNodes, onNodesChange] = useNodesState<Node>([]);
  const [localEdges, setLocalEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // Track if we're syncing from Redux to avoid circular updates
  const isSyncingFromRedux = useRef(false);
  // Track if we're syncing selection to avoid circular updates
  const isSyncingSelectionRef = useRef(false);
  // Track previous workflow id to detect workflow switch
  const prevWorkflowIdRef = useRef<string | null>(null);
  // Track previous node/edge counts to detect structural changes
  const prevNodeCountRef = useRef<number>(0);
  const prevEdgeCountRef = useRef<number>(0);
  // Track if ReactFlow is initialized (for initial viewport restore)
  const isReactFlowReady = useRef(false);
  // Track pending viewport to restore after init
  const pendingViewportRef = useRef<Viewport | null>(null);

  // Sync Redux selectedNodeId to ReactFlow's visual selection
  useEffect(() => {
    isSyncingSelectionRef.current = true;
    setLocalNodes((nodes) =>
      nodes.map((node) => ({
        ...node,
        selected: node.id === selectedNodeId,
      }))
    );
    // Reset flag after state update settles
    queueMicrotask(() => {
      isSyncingSelectionRef.current = false;
    });
  }, [selectedNodeId, setLocalNodes]);

  // Listen to ReactFlow selection changes and sync to Redux
  useOnSelectionChange({
    onChange: ({ nodes }) => {
      // Skip if we're syncing from Redux to local
      if (isSyncingSelectionRef.current) return;

      const newSelectedId = nodes.length > 0 ? nodes[0].id : null;
      // Only dispatch if selection actually changed
      if (newSelectedId !== selectedNodeId) {
        // Defer dispatch to avoid updating during render
        queueMicrotask(() => {
          dispatch(selectNode(newSelectedId));
        });
      }
    },
  });

  // Handle ReactFlow initialization - restore viewport here
  const handleInit = useCallback(
    (_instance: ReactFlowInstance) => {
      isReactFlowReady.current = true;
      // Restore pending viewport if we have one
      if (pendingViewportRef.current) {
        setViewport(pendingViewportRef.current, { duration: 0 });
        pendingViewportRef.current = null;
      }
    },
    [setViewport]
  );

  // Sync from Redux to local state ONLY when workflow changes or structure changes (add/remove)
  // We don't want to sync on every Redux update (e.g., position changes) as local state is source of truth during editing
  useEffect(() => {
    const workflowChanged = selectedWorkflowId !== prevWorkflowIdRef.current;
    const nodeCountChanged = reduxNodes.length !== prevNodeCountRef.current;
    const edgeCountChanged = reduxEdges.length !== prevEdgeCountRef.current;

    // Update tracking refs
    prevNodeCountRef.current = reduxNodes.length;
    prevEdgeCountRef.current = reduxEdges.length;

    // Only do full sync when workflow changes or nodes/edges are added/removed
    if (workflowChanged || nodeCountChanged || edgeCountChanged) {
      isSyncingFromRedux.current = true;
      setLocalNodes(reduxNodes);
      setLocalEdges(reduxEdges);

      // Restore viewport when switching workflows
      if (workflowChanged) {
        prevWorkflowIdRef.current = selectedWorkflowId;
        if (reduxViewport && selectedWorkflowId) {
          if (isReactFlowReady.current) {
            // ReactFlow is ready, set viewport immediately
            setViewport(reduxViewport, { duration: 0 });
          } else {
            // ReactFlow not ready yet, save for onInit
            pendingViewportRef.current = reduxViewport;
          }
        }
      }

      // Reset sync flag after state update
      isSyncingFromRedux.current = false;
    }
  }, [reduxNodes, reduxEdges, selectedWorkflowId, reduxViewport, setLocalNodes, setLocalEdges, setViewport]);

  // Sync node data (config) changes from Redux to local state
  // This ensures config panel changes are reflected in the canvas without losing positions
  useEffect(() => {
    // Skip if we're already syncing
    if (isSyncingFromRedux.current) return;

    setLocalNodes((currentNodes) =>
      currentNodes.map((localNode) => {
        const reduxNode = reduxNodes.find((n) => n.id === localNode.id);
        if (!reduxNode) return localNode;

        // Check if data has changed (shallow comparison)
        const dataChanged = JSON.stringify(localNode.data) !== JSON.stringify(reduxNode.data);
        if (dataChanged) {
          return {
            ...localNode,
            data: reduxNode.data,
          };
        }
        return localNode;
      })
    );
  }, [reduxNodes, setLocalNodes]);

  // Handle pane click - deselect all nodes (but not when text tool is active)
  const handlePaneClick = useCallback(() => {
    if (activeTool === "text") return; // Don't deselect when drawing
    dispatch(selectNode(null));
  }, [dispatch, activeTool]);

  // Handle node changes (position, removal - selection is handled by useOnSelectionChange)
  const handleNodesChange: OnNodesChange = useCallback(
    (changes) => {
      // Apply all changes locally (including selection for visual feedback)
      onNodesChange(changes);

      // Skip syncing to Redux if we're syncing from Redux
      if (isSyncingFromRedux.current) return;

      // Process position changes for Redux sync
      const positionUpdates: { id: string; position: { x: number; y: number } }[] = [];

      for (const change of changes) {
        if (change.type === "position" && change.position && !change.dragging) {
          // Sync final position to Redux on drag end
          positionUpdates.push({ id: change.id, position: change.position });
        }
      }

      if (positionUpdates.length > 0) {
        dispatch(updateNodePositions(positionUpdates));
      }
    },
    [dispatch, onNodesChange]
  );

  // Handle nodes deleted
  const handleNodesDelete = useCallback(
    (deletedNodes: Node[]) => {
      const ids = deletedNodes.map((n) => n.id);
      dispatch(removeNodes(ids));
    },
    [dispatch]
  );

  // Handle edge changes (removal)
  const handleEdgesChange: OnEdgesChange = useCallback(
    (changes) => {
      // Always apply changes locally
      onEdgesChange(changes);

      // Skip syncing to Redux if we're syncing from Redux
      if (isSyncingFromRedux.current) return;

      const removedIds: string[] = [];
      for (const change of changes) {
        if (change.type === "remove") {
          removedIds.push(change.id);
        }
      }
      if (removedIds.length > 0) {
        dispatch(removeEdges(removedIds));
      }
    },
    [dispatch, onEdgesChange]
  );

  // Handle new connections
  const handleConnect: OnConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;

      const newEdge: Edge = {
        id: `edge-${uuidv4()}`,
        type: "deletable",
        source: connection.source,
        sourceHandle: connection.sourceHandle,
        target: connection.target,
        targetHandle: connection.targetHandle,
      };

      dispatch(addEdgeAction(newEdge));
    },
    [dispatch]
  );

  // Handle viewport changes (pan/zoom)
  const handleMoveEnd = useCallback(
    (_event: unknown, viewport: Viewport) => {
      dispatch(updateViewport({ x: viewport.x, y: viewport.y, zoom: viewport.zoom }));
    },
    [dispatch]
  );

  // Handle drop events
  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      onDrop(event);
    },
    [onDrop]
  );

  const handleDragOver = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      onDragOver(event);
    },
    [onDragOver]
  );

  // Handle mouse down on pane for text tool drawing
  const handlePaneMouseDown = useCallback(
    (event: React.MouseEvent) => {
      if (activeTool !== "text") return;

      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      setIsDrawing(true);
      setDrawStart(position);
      setDrawRect({ x: position.x, y: position.y, width: 0, height: 0 });
    },
    [activeTool, screenToFlowPosition]
  );

  // Handle mouse move for drawing
  const handlePaneMouseMove = useCallback(
    (event: React.MouseEvent) => {
      if (!isDrawing || !drawStart) return;

      const currentPos = screenToFlowPosition({ x: event.clientX, y: event.clientY });

      // Calculate rectangle dimensions (allow drawing in any direction)
      const x = Math.min(drawStart.x, currentPos.x);
      const y = Math.min(drawStart.y, currentPos.y);
      const width = Math.abs(currentPos.x - drawStart.x);
      const height = Math.abs(currentPos.y - drawStart.y);

      setDrawRect({ x, y, width, height });
    },
    [isDrawing, drawStart, screenToFlowPosition]
  );

  // Handle mouse up to complete drawing
  const handlePaneMouseUp = useCallback(() => {
    if (!isDrawing || !drawRect) {
      setIsDrawing(false);
      setDrawStart(null);
      setDrawRect(null);
      return;
    }

    // Minimum size check (at least 100x50)
    const finalWidth = Math.max(drawRect.width, 200);
    const finalHeight = Math.max(drawRect.height, 100);

    // Create text annotation node
    const newNode = createTextAnnotationNode(
      `text-${uuidv4()}`,
      { x: drawRect.x, y: drawRect.y },
      finalWidth,
      finalHeight
    );

    dispatch(addNode(newNode as WorkflowNode));

    // Reset drawing state and switch back to select tool
    setIsDrawing(false);
    setDrawStart(null);
    setDrawRect(null);
    setActiveTool("select");
  }, [isDrawing, drawRect, dispatch]);

  // Empty state when no workflow selected
  if (!selectedWorkflowId) {
    return (
      <CanvasContainer>
        <EmptyState>
          <WorkflowIcon sx={{ fontSize: 64, opacity: 0.5 }} />
          <Typography variant="h6">{t("no_workflow_selected")}</Typography>
          <Typography variant="body2">{t("select_or_create_workflow")}</Typography>
        </EmptyState>
      </CanvasContainer>
    );
  }

  return (
    <CanvasContainer
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      sx={{ cursor: activeTool === "text" ? "crosshair" : "default" }}>
      <ReactFlow
        nodes={localNodes}
        edges={localEdges}
        onInit={handleInit}
        onNodesChange={handleNodesChange}
        onNodesDelete={handleNodesDelete}
        onEdgesChange={handleEdgesChange}
        onConnect={handleConnect}
        onPaneClick={handlePaneClick}
        onPaneMouseMove={handlePaneMouseMove}
        onMoveEnd={handleMoveEnd}
        isValidConnection={validateConnection}
        selectionOnDrag={activeTool === "select"}
        panOnDrag={activeTool === "select"}
        deleteKeyCode={["Backspace", "Delete"]}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        zIndexMode="manual"
        elevateNodesOnSelect={false}
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{
          type: "deletable",
          zIndex: 500, // Edges appear above text annotations (zIndex: 0) but below tool/dataset nodes (zIndex: 1000)
          style: { stroke: theme.palette.grey[500], strokeWidth: 2 },
        }}
        connectionLineStyle={{ stroke: theme.palette.grey[500], strokeWidth: 2 }}>
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
        <Controls />
        <MiniMap
          nodeColor={() => theme.palette.grey[500]}
          maskColor={theme.palette.mode === "dark" ? "rgba(0,0,0,0.8)" : "rgba(255,255,255,0.8)"}
        />
      </ReactFlow>

      {/* Drawing overlay for text annotation tool */}
      {activeTool === "text" && (
        <Box
          onMouseDown={handlePaneMouseDown}
          onMouseMove={handlePaneMouseMove}
          onMouseUp={handlePaneMouseUp}
          onMouseLeave={handlePaneMouseUp}
          sx={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            cursor: "crosshair",
            zIndex: 5,
          }}
        />
      )}

      {/* Drawing rectangle preview */}
      {isDrawing && drawRect && (
        <Box
          sx={{
            position: "absolute",
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
            pointerEvents: "none",
            zIndex: 6,
          }}>
          <svg width="100%" height="100%" style={{ overflow: "visible" }}>
            <rect
              x={drawRect.x}
              y={drawRect.y}
              width={drawRect.width}
              height={drawRect.height}
              fill={theme.palette.primary.main}
              fillOpacity={0.1}
              stroke={theme.palette.primary.main}
              strokeWidth={2}
              strokeDasharray="5,5"
              style={{
                transform: `translate(${reduxViewport?.x || 0}px, ${reduxViewport?.y || 0}px) scale(${reduxViewport?.zoom || 1})`,
                transformOrigin: "0 0",
              }}
            />
          </svg>
        </Box>
      )}

      {/* Bottom Toolbar */}
      <CanvasToolbar
        activeTool={activeTool}
        onToolChange={setActiveTool}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={undo}
        onRedo={redo}
        onRun={() => {
          // TODO: Implement run workflow
        }}
        canRun={localNodes.length > 0}
      />

      {/* Empty canvas hint */}
      {localNodes.length === 0 && (
        <EmptyState>
          <EmptyStateCard>
            <EmptyStateIconWrapper>
              <WorkflowIcon sx={{ fontSize: 32 }} />
            </EmptyStateIconWrapper>
            <Typography variant="subtitle1" fontWeight="medium" color="text.primary">
              {t("start_building_workflow")}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t("drag_tools_to_start")}
            </Typography>
          </EmptyStateCard>
        </EmptyState>
      )}
    </CanvasContainer>
  );
};

export default WorkflowCanvas;
