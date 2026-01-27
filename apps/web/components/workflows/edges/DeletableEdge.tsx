"use client";

import { Close as CloseIcon } from "@mui/icons-material";
import { IconButton, useTheme } from "@mui/material";
import { styled } from "@mui/material/styles";
import { BaseEdge, EdgeLabelRenderer, type EdgeProps, getBezierPath } from "@xyflow/react";
import React, { memo, useCallback, useMemo } from "react";
import { useDispatch } from "react-redux";

import type { AppDispatch } from "@/lib/store";
import { removeEdges } from "@/lib/store/workflow/slice";

const DeleteButton = styled(IconButton)(({ theme }) => ({
  width: 20,
  height: 20,
  backgroundColor: theme.palette.error.main,
  color: theme.palette.common.white,
  padding: 0,
  "&:hover": {
    backgroundColor: theme.palette.error.dark,
  },
  "& svg": {
    fontSize: 14,
  },
}));

const DeletableEdge: React.FC<EdgeProps> = ({
  id,
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
  const dispatch = useDispatch<AppDispatch>();
  const theme = useTheme();

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  // Merge style with selected color
  const edgeStyle = useMemo(
    () => ({
      ...style,
      stroke: selected ? theme.palette.primary.main : style.stroke,
      strokeWidth: selected ? 3 : (style.strokeWidth as number) || 2,
    }),
    [style, selected, theme.palette.primary.main]
  );

  const handleDelete = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      dispatch(removeEdges([id]));
    },
    [dispatch, id]
  );

  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={edgeStyle} />
      {selected && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: "all",
            }}>
            <DeleteButton size="small" onClick={handleDelete}>
              <CloseIcon />
            </DeleteButton>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
};

export default memo(DeletableEdge);
