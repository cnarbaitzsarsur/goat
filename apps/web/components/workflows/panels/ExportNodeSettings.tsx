"use client";

/**
 * Export Node Settings Panel
 *
 * Shows configuration for a selected export node.
 * Mirrors the exact same layout structure as tool nodes in WorkflowNodeSettings.
 *
 * Uses local state for form values (same pattern as tool nodes) to ensure
 * instant UI updates. Redux is updated as a side effect.
 */
import { CheckCircle as CheckCircleIcon } from "@mui/icons-material";
import {
  Box,
  Checkbox,
  Chip,
  Divider,
  FormControlLabel,
  Stack,
  TextField,
  Typography,
  useTheme,
} from "@mui/material";
import { useEdges, useNodes } from "@xyflow/react";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDispatch } from "react-redux";

import type { AppDispatch } from "@/lib/store";
import { updateNode } from "@/lib/store/workflow/slice";
import type { ExportNodeData, WorkflowNode } from "@/lib/validations/workflow";

import Container from "@/components/map/panels/Container";
import ToolsHeader from "@/components/map/panels/common/ToolsHeader";
import {
  type NodeExecutionStatus,
  useWorkflowExecutionContext,
} from "@/components/workflows/context/WorkflowExecutionContext";

interface ExportNodeSettingsProps {
  node: WorkflowNode;
  onBack: () => void;
}

export default function ExportNodeSettings({ node, onBack }: ExportNodeSettingsProps) {
  const { t } = useTranslation("common");
  const theme = useTheme();
  const dispatch = useDispatch<AppDispatch>();
  const edges = useEdges();
  const rfNodes = useNodes();

  const { nodeStatuses } = useWorkflowExecutionContext();
  const nodeStatus: NodeExecutionStatus | undefined = nodeStatuses[node.id];

  const data = node.data as ExportNodeData;

  // Local state for form values — provides instant UI updates.
  // Redux is updated as a side effect (same pattern as tool nodes).
  const [datasetName, setDatasetName] = useState(data.datasetName || "");
  const [addToProject, setAddToProject] = useState(!!data.addToProject);
  const [overwritePrevious, setOverwritePrevious] = useState(!!data.overwritePrevious);

  // Reset local state when a different node is selected
  useEffect(() => {
    setDatasetName(data.datasetName || "");
    setAddToProject(!!data.addToProject);
    setOverwritePrevious(!!data.overwritePrevious);
  }, [node.id, data.datasetName, data.addToProject, data.overwritePrevious]);

  // Find the upstream tool node connected to this export node
  const upstreamInfo = useMemo(() => {
    const incomingEdge = edges.find((e) => e.target === node.id);
    if (!incomingEdge) return null;
    const sourceNode = rfNodes.find((n) => n.id === incomingEdge.source);
    if (!sourceNode) return null;
    return {
      nodeId: sourceNode.id,
      label: (sourceNode.data as { label?: string }).label || sourceNode.id,
    };
  }, [edges, rfNodes, node.id]);

  // Persist a field change to Redux (side effect, not driving UI)
  const syncToRedux = useCallback(
    (field: keyof ExportNodeData, value: unknown) => {
      dispatch(
        updateNode({
          id: node.id,
          changes: {
            data: {
              ...node.data,
              [field]: value,
            },
          },
        })
      );
    },
    [dispatch, node.id, node.data]
  );

  const handleDatasetNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setDatasetName(val);
      syncToRedux("datasetName", val);
    },
    [syncToRedux]
  );

  const handleAddToProjectChange = useCallback(
    (_: React.SyntheticEvent, checked: boolean) => {
      setAddToProject(checked);
      syncToRedux("addToProject", checked);
    },
    [syncToRedux]
  );

  const handleOverwriteChange = useCallback(
    (_: React.SyntheticEvent, checked: boolean) => {
      setOverwritePrevious(checked);
      syncToRedux("overwritePrevious", checked);
    },
    [syncToRedux]
  );

  return (
    <Container
      header={<ToolsHeader onBack={onBack} title={t("export_dataset")} />}
      disablePadding={false}
      body={
        <Box sx={{ display: "flex", flexDirection: "column" }}>
          {/* Description */}
          <Typography variant="body2" sx={{ fontStyle: "italic", mb: theme.spacing(4) }}>
            {t("export_dataset_description")}
          </Typography>

          {/* Execution Status Section */}
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" fontWeight="bold" color="text.secondary" sx={{ mb: 1 }}>
              {t("execution_status")}
            </Typography>
            <Divider sx={{ mb: 1.5 }} />
            <Chip
              label={nodeStatus ? t(nodeStatus) : t("idle")}
              size="small"
              color={
                nodeStatus === "completed"
                  ? "primary"
                  : nodeStatus === "failed"
                    ? "error"
                    : nodeStatus === "running"
                      ? "warning"
                      : "default"
              }
              variant={nodeStatus ? "filled" : "outlined"}
              sx={{ fontWeight: 600, textTransform: "uppercase" }}
            />
          </Box>

          {/* Parameters Section */}
          <Box sx={{ mt: 3, mb: 2 }}>
            <Typography variant="body2" fontWeight="bold" color="text.secondary" sx={{ mb: 1 }}>
              {t("parameters")}
            </Typography>
            <Divider sx={{ mb: 1.5 }} />
          </Box>

          {/* Source connection info */}
          {upstreamInfo && (
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
              <Typography variant="body2" color="text.secondary">
                {t("receives_output_from")}:
              </Typography>
              <Typography variant="body2" fontWeight="bold">
                {t(upstreamInfo.label, { defaultValue: upstreamInfo.label })}
              </Typography>
            </Stack>
          )}

          {/* Dataset name */}
          <Stack spacing={1} sx={{ mb: 2 }}>
            <Typography variant="body2" color="text.secondary">
              {t("dataset_name")}
            </Typography>
            <TextField
              fullWidth
              size="small"
              placeholder={t("enter_dataset_name")}
              value={datasetName}
              onChange={handleDatasetNameChange}
              inputProps={{
                style: { fontSize: "0.875rem" },
              }}
            />
          </Stack>

          {/* Options */}
          <FormControlLabel
            control={<Checkbox checked={addToProject} onChange={handleAddToProjectChange} size="small" />}
            label={<Typography variant="body2">{t("add_to_project")}</Typography>}
            sx={{ ml: 0, mb: 0.5 }}
          />

          <FormControlLabel
            control={<Checkbox checked={overwritePrevious} onChange={handleOverwriteChange} size="small" />}
            label={<Typography variant="body2">{t("overwrite_on_rerun")}</Typography>}
            sx={{ ml: 0 }}
          />

          {/* Completed state info */}
          {nodeStatus === "completed" && data.exportedLayerId && (
            <Box sx={{ mt: 3, mb: 2 }}>
              <Typography variant="body2" fontWeight="bold" color="text.secondary" sx={{ mb: 1 }}>
                {t("result")}
              </Typography>
              <Divider sx={{ mb: 1.5 }} />
              <Stack direction="row" alignItems="center" spacing={1}>
                <CheckCircleIcon sx={{ fontSize: 16, color: "success.main" }} />
                <Typography variant="body2" color="success.main" fontWeight="bold">
                  {t("dataset_exported_successfully")}
                </Typography>
              </Stack>
            </Box>
          )}

          {/* Error state */}
          {nodeStatus === "failed" && data.error && (
            <Box sx={{ mt: 3, mb: 2 }}>
              <Typography variant="body2" fontWeight="bold" color="text.secondary" sx={{ mb: 1 }}>
                {t("result")}
              </Typography>
              <Divider sx={{ mb: 1.5 }} />
              <Typography variant="body2" color="error.main">
                {data.error}
              </Typography>
            </Box>
          )}
        </Box>
      }
    />
  );
}
