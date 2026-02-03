"use client";

import { Delete as DeleteIcon } from "@mui/icons-material";
import { GlobalStyles, IconButton, Stack, Tooltip, useTheme } from "@mui/material";
import { styled } from "@mui/material/styles";
import { BaseEdge, EdgeLabelRenderer, type EdgeProps, getBezierPath, useViewport } from "@xyflow/react";
import React, { memo, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useDispatch } from "react-redux";

import type { AppDispatch } from "@/lib/store";
import { removeEdges } from "@/lib/store/workflow/slice";

import { useWorkflowExecutionContext } from "../context/WorkflowExecutionContext";

// Styled to match node toolbar style (same as DatasetNode)
const ToolbarContainer = styled(Stack)(({ theme }) => ({
  backgroundColor: theme.palette.background.paper,
  borderRadius: theme.shape.borderRadius * 2,
  padding: theme.spacing(1),
  gap: theme.spacing(0.5),
  flexDirection: "row",
  alignItems: "center",
  boxShadow: theme.shadows[4],
  border: `1px solid ${theme.palette.divider}`,
}));

const ToolbarButton = styled(IconButton)(({ theme }) => ({
  width: 36,
  height: 36,
  "&:hover": {
    backgroundColor: theme.palette.action.hover,
  },
}));

// Global styles for animated edge - keyframes don't work in inline styles
const AnimatedEdgeStyles = () => (
  <GlobalStyles
    styles={{
      "@keyframes dashFlow": {
        "0%": { strokeDashoffset: 24 },
        "100%": { strokeDashoffset: 0 },
      },
      ".react-flow__edge-path.animated-running": {
        animation: "dashFlow 0.5s linear infinite",
      },
    }}
  />
);

const DeletableEdge: React.FC<EdgeProps> = ({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  selected,
}) => {
  const { t } = useTranslation("common");
  const dispatch = useDispatch<AppDispatch>();
  const theme = useTheme();
  const { zoom } = useViewport();

  // Get execution status from context
  const { nodeStatuses } = useWorkflowExecutionContext();
  const sourceStatus = nodeStatuses[source];
  const targetStatus = nodeStatuses[target];

  // Determine edge execution state
  // Edge is running if target node is running (data flowing into it)
  const isEdgeRunning = targetStatus === "running";
  // Edge is completed if target is completed, or if source is completed and target is running
  // For dataset->tool edges, source won't have status, so just check target
  const isEdgeCompleted =
    targetStatus === "completed" || (sourceStatus === "completed" && targetStatus === "completed");

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  // Merge style with selected color and execution state
  const edgeStyle = useMemo(
    () => ({
      ...style,
      stroke: isEdgeCompleted
        ? theme.palette.primary.main
        : isEdgeRunning
          ? theme.palette.warning.main
          : selected
            ? theme.palette.primary.main
            : style.stroke,
      strokeWidth: isEdgeRunning || isEdgeCompleted ? 3 : selected ? 3 : (style.strokeWidth as number) || 2,
      // Add dashed pattern for running edges
      ...(isEdgeRunning && {
        strokeDasharray: "8 8",
      }),
    }),
    [style, selected, theme.palette.primary.main, theme.palette.warning.main, isEdgeRunning, isEdgeCompleted]
  );

  const handleDelete = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      event.preventDefault();
      dispatch(removeEdges([id]));
    },
    [dispatch, id]
  );

  return (
    <>
      <AnimatedEdgeStyles />
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={edgeStyle}
        className={isEdgeRunning ? "animated-running" : ""}
      />
      {selected && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan"
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px) scale(${1 / zoom})`,
              transformOrigin: "center center",
              pointerEvents: "all",
              zIndex: 1000,
            }}
            onMouseDown={(e) => e.stopPropagation()}>
            <ToolbarContainer onClick={handleDelete}>
              <Tooltip title={t("delete")} placement="top" arrow>
                <ToolbarButton size="small">
                  <DeleteIcon fontSize="small" color="error" />
                </ToolbarButton>
              </Tooltip>
            </ToolbarContainer>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
};

export default memo(DeletableEdge);
