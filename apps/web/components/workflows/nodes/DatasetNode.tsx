"use client";

import {
  Storage as DatasetIcon,
  Delete as DeleteIcon,
  ContentCopy as DuplicateIcon,
} from "@mui/icons-material";
import { Box, IconButton, Stack, Typography } from "@mui/material";
import { styled } from "@mui/material/styles";
import { Handle, type NodeProps, Position } from "@xyflow/react";
import React, { memo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useDispatch, useSelector } from "react-redux";
import { v4 as uuidv4 } from "uuid";

import { ICON_NAME, Icon } from "@p4b/ui/components/Icon";

import type { AppDispatch } from "@/lib/store";
import { selectNodes } from "@/lib/store/workflow/selectors";
import { addNode, removeNodes } from "@/lib/store/workflow/slice";
import type { DatasetNodeData } from "@/lib/validations/workflow";

const NodeWrapper = styled(Box)({
  position: "relative",
});

const NodeContainer = styled(Box, {
  shouldForwardProp: (prop) => prop !== "selected",
})<{ selected?: boolean }>(({ theme, selected }) => ({
  padding: theme.spacing(1.5),
  borderRadius: theme.shape.borderRadius,
  backgroundColor: theme.palette.background.paper,
  border: `2px solid ${selected ? theme.palette.primary.main : theme.palette.divider}`,
  // Box-shadow for selection indicator (blue glow)
  boxShadow: selected ? `0 0 0 4px ${theme.palette.primary.main}40, ${theme.shadows[4]}` : theme.shadows[2],
  minWidth: 160,
  maxWidth: 220,
  transition: "all 0.2s ease",
  position: "relative",
  "&:hover": {
    boxShadow: selected ? `0 0 0 4px ${theme.palette.primary.main}40, ${theme.shadows[4]}` : theme.shadows[4],
  },
}));

const NodeHeader = styled(Box)(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  gap: theme.spacing(1),
  marginBottom: theme.spacing(0.5),
  paddingRight: 40,
}));

const NodeIconWrapper = styled(Box, {
  shouldForwardProp: (prop) => prop !== "selected",
})<{ selected?: boolean }>(({ theme, selected }) => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 28,
  height: 28,
  minWidth: 28,
  borderRadius: "50%",
  backgroundColor: selected ? theme.palette.primary.main : theme.palette.grey[500],
  color: theme.palette.common.white,
}));

const StyledHandle = styled(Handle, {
  shouldForwardProp: (prop) => prop !== "selected",
})<{ selected?: boolean }>(({ theme, selected }) => ({
  width: 12,
  height: 12,
  backgroundColor: selected ? theme.palette.primary.main : theme.palette.grey[500],
  border: `2px solid ${theme.palette.background.paper}`,
}));

const ActionBar = styled(Stack)(({ theme }) => ({
  position: "absolute",
  top: -2,
  right: -2,
  backgroundColor: theme.palette.primary.main,
  borderRadius: `0 ${theme.shape.borderRadius}px 0 ${theme.shape.borderRadius}px`,
  padding: "2px 3px",
  gap: 1,
  flexDirection: "row",
}));

const ActionButton = styled(IconButton)(({ theme }) => ({
  padding: 1,
  color: theme.palette.common.white,
  "&:hover": {
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  "& svg": {
    fontSize: 12,
  },
}));

interface DatasetNodeProps extends NodeProps {
  data: DatasetNodeData;
}

const DatasetNode: React.FC<DatasetNodeProps> = ({ id, data, selected }) => {
  const { t } = useTranslation("common");
  const dispatch = useDispatch<AppDispatch>();
  const nodes = useSelector(selectNodes);

  // Get geometry icon based on layer type
  const getGeometryIcon = () => {
    switch (data.geometryType) {
      case "point":
        return ICON_NAME.POINT_FEATURE;
      case "line":
        return ICON_NAME.LINE_FEATURE;
      case "polygon":
        return ICON_NAME.POLYGON_FEATURE;
      default:
        return ICON_NAME.TABLE;
    }
  };

  // Handle duplicate node
  const handleDuplicate = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      const node = nodes.find((n) => n.id === id);
      if (!node) return;

      dispatch(
        addNode({
          ...node,
          id: `dataset-${uuidv4()}`,
          position: {
            x: node.position.x + 50,
            y: node.position.y + 50,
          },
        })
      );
    },
    [id, nodes, dispatch]
  );

  // Handle delete node
  const handleDelete = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      dispatch(removeNodes([id]));
    },
    [id, dispatch]
  );

  return (
    <NodeWrapper>
      <NodeContainer selected={selected}>
        {/* Action buttons - only when selected */}
        {selected && (
          <ActionBar>
            <ActionButton onClick={handleDuplicate} title={t("duplicate")}>
              <DuplicateIcon />
            </ActionButton>
            <ActionButton onClick={handleDelete} title={t("delete")}>
              <DeleteIcon />
            </ActionButton>
          </ActionBar>
        )}

        {/* Output handle - right */}
        <StyledHandle type="source" position={Position.Right} selected={selected} />

        <NodeHeader>
          <NodeIconWrapper selected={selected}>
            <DatasetIcon sx={{ fontSize: 16 }} />
          </NodeIconWrapper>
          <Typography variant="caption" color="text.secondary" fontWeight="medium">
            {data.layerId ? "Layer" : t("add_dataset")}
          </Typography>
        </NodeHeader>

        <Typography variant="body2" fontWeight="medium" sx={{ mb: 0.5, wordBreak: "break-word" }}>
          {data.label}
        </Typography>

        {data.geometryType && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <Icon iconName={getGeometryIcon()} sx={{ fontSize: 12, opacity: 0.7 }} />
            <Typography variant="caption" color="text.secondary">
              {data.geometryType}
            </Typography>
          </Box>
        )}
      </NodeContainer>
    </NodeWrapper>
  );
};

export default memo(DatasetNode);
