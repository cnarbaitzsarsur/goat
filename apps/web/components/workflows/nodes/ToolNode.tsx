"use client";

import {
  CheckCircle as CheckCircleIcon,
  Delete as DeleteIcon,
  ContentCopy as DuplicateIcon,
  PlayArrow as PlayIcon,
  SkipNext as RunToHereIcon,
  Save as SaveIcon,
  Settings as ToolSettingsIcon,
  Warning as WarningIcon,
} from "@mui/icons-material";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  GlobalStyles,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { keyframes, styled } from "@mui/material/styles";
import { Handle, type NodeProps, NodeToolbar, Position, useEdges } from "@xyflow/react";
import React, { memo, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDispatch, useSelector } from "react-redux";
import { toast } from "react-toastify";
import { v4 as uuidv4 } from "uuid";

import { ICON_NAME, Icon } from "@p4b/ui/components/Icon";

import type { AppDispatch } from "@/lib/store";
import { selectNodes } from "@/lib/store/workflow/selectors";
import { addNode, removeNodes } from "@/lib/store/workflow/slice";
import {
  evaluateCondition,
  extractInputDataType,
  extractOutputDataType,
  formatDataType,
} from "@/lib/utils/ogc-utils";
import type { ToolNodeData } from "@/lib/validations/workflow";

import { useProcessDescription } from "@/hooks/map/useOgcProcesses";

import { useWorkflowExecutionContext } from "../context/WorkflowExecutionContext";

/**
 * Format duration in milliseconds to human-readable string
 * e.g., 1234 -> "1.2s", 65000 -> "1m 5.0s"
 */
const formatDuration = (ms: number): string => {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  const totalSeconds = ms / 1000;
  if (totalSeconds < 60) {
    return `${totalSeconds.toFixed(1)}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  return `${minutes}m ${remainingSeconds.toFixed(1)}s`;
};

// Keyframe animation for border angle (animates CSS custom property)
const borderAngleRunning = keyframes`
  from {
    --border-angle: 0deg;
  }
  to {
    --border-angle: 360deg;
  }
`;

// Global styles to register @property for --border-angle
const BorderAnglePropertyStyles = () => (
  <GlobalStyles
    styles={`
      @property --border-angle {
        syntax: "<angle>";
        inherits: true;
        initial-value: 0deg;
      }
    `}
  />
);

const NodeContainer = styled(Box, {
  shouldForwardProp: (prop) => prop !== "selected",
})<{ selected?: boolean }>(({ theme, selected }) => ({
  padding: theme.spacing(1.5),
  borderRadius: theme.shape.borderRadius,
  backgroundColor: theme.palette.background.paper,
  border: `2px solid ${selected ? theme.palette.primary.main : theme.palette.divider}`,
  boxShadow: selected
    ? `0 0 0 4px ${theme.palette.primary.main}40, 0 2px 8px rgba(0, 0, 0, 0.1)`
    : "0 2px 8px rgba(0, 0, 0, 0.08)",
  minWidth: 220,
  maxWidth: 360,
  transition: "all 0.2s ease",
  position: "relative",
  "&:hover": {
    boxShadow: selected
      ? `0 0 0 4px ${theme.palette.primary.main}40, 0 2px 8px rgba(0, 0, 0, 0.12)`
      : "0 2px 8px rgba(0, 0, 0, 0.12)",
  },
}));

const NodeHeader = styled(Box)(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  gap: theme.spacing(1),
  marginBottom: theme.spacing(0.5),
}));

// Icon wrapper with status-based styling
const NodeIconWrapper = styled(Box, {
  shouldForwardProp: (prop) => prop !== "status",
})<{ status?: "pending" | "running" | "completed" | "failed" }>(({ theme, status }) => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 40,
  height: 40,
  minWidth: 40,
  borderRadius: theme.shape.borderRadius,
  position: "relative",
  // Animated conic-gradient border when running (like the example)
  ...(status === "running" &&
    ({
      "--border-angle": "0deg",
      background: `linear-gradient(${theme.palette.background.paper}, ${theme.palette.background.paper}) padding-box, conic-gradient(from var(--border-angle), ${theme.palette.warning.main} 50%, ${theme.palette.divider} 50%) border-box`,
      borderColor: "transparent",
      borderStyle: "solid",
      borderWidth: "2px",
      animation: `${borderAngleRunning} 2s linear infinite`,
    } as const)),
  // Static styles for other states
  ...(status !== "running" && {
    border: `1px solid ${
      status === "completed"
        ? theme.palette.primary.main
        : status === "failed"
          ? theme.palette.error.main
          : theme.palette.divider
    }`,
    backgroundColor:
      status === "completed"
        ? theme.palette.primary.main + "20"
        : status === "failed"
          ? theme.palette.error.light + "30"
          : theme.palette.background.default,
  }),
}));

// Small badge on icon corner
const IconStatusBadge = styled(Box)(({ theme }) => ({
  position: "absolute",
  top: -6,
  right: -6,
  width: 18,
  height: 18,
  borderRadius: "50%",
  backgroundColor: theme.palette.primary.main,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: theme.palette.common.white,
  zIndex: 2,
  border: `2px solid ${theme.palette.background.paper}`,
}));

// Animated border wrapper for running state - smooth conic-gradient rotation
const AnimatedBorderWrapper = styled(Box, {
  shouldForwardProp: (prop) => prop !== "isRunning",
})<{ isRunning?: boolean }>(({ theme: _theme, isRunning: _isRunning }) => ({
  position: "relative",
  width: 40,
  height: 40,
  minWidth: 40,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  "@property --border-angle": {
    syntax: "'<angle>'",
    inherits: "true",
    initialValue: "0deg",
  },
}));

const StyledHandle = styled(Handle, {
  shouldForwardProp: (prop) => prop !== "selected",
})<{ selected?: boolean }>(({ theme, selected }) => ({
  width: 12,
  height: 12,
  backgroundColor: selected ? theme.palette.primary.main : theme.palette.grey[500],
  border: `2px solid ${theme.palette.background.paper}`,
}));

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

const RunButton = styled(Button)(({ theme }) => ({
  textTransform: "none",
  fontWeight: 600,
  fontSize: 12,
  height: 36,
  padding: theme.spacing(0.5, 1.5),
  minWidth: "auto",
  borderRadius: theme.shape.borderRadius,
}));

const ParamRow = styled(Box)({
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 16,
});

const WarningBadge = styled(Box)(({ theme }) => ({
  position: "absolute",
  bottom: -14,
  right: -8,
  width: 24,
  height: 24,
  borderRadius: "50%",
  backgroundColor: theme.palette.warning.main,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: theme.palette.warning.contrastText,
  zIndex: 1,
}));

const _ExecutionStatusBadge = styled(Box, {
  shouldForwardProp: (prop) => prop !== "status",
})<{ status: "pending" | "running" | "completed" | "failed" }>(({ theme, status }) => ({
  position: "absolute",
  top: -10,
  right: -10,
  width: 28,
  height: 28,
  borderRadius: "50%",
  backgroundColor:
    status === "completed"
      ? theme.palette.success.main
      : status === "failed"
        ? theme.palette.error.main
        : status === "running"
          ? theme.palette.primary.main
          : theme.palette.grey[500],
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: theme.palette.common.white,
  zIndex: 2,
  border: `2px solid ${theme.palette.background.paper}`,
}));

interface ToolNodeProps extends NodeProps {
  data: ToolNodeData;
}

const ToolNode: React.FC<ToolNodeProps> = ({ id, data, selected }) => {
  const { t } = useTranslation("common");
  const dispatch = useDispatch<AppDispatch>();
  const nodes = useSelector(selectNodes);
  const edges = useEdges();

  // Get execution status from context
  const { isExecuting, nodeStatuses, nodeExecutionInfo, tempLayerIds, onSaveNode } =
    useWorkflowExecutionContext();
  const nodeStatus = nodeStatuses[id];
  const executionInfo = nodeExecutionInfo[id];
  const hasTempResult = !!tempLayerIds[id];

  // Debug logging for execution status
  console.log(
    `[ToolNode ${id}] nodeStatus:`,
    nodeStatus,
    "executionInfo:",
    executionInfo,
    "durationMs:",
    executionInfo?.durationMs
  );

  // Saving state
  const [isSaving, setIsSaving] = useState(false);

  // Handle save node result
  const handleSave = useCallback(async () => {
    if (!onSaveNode || isSaving) return;
    setIsSaving(true);
    try {
      await onSaveNode(id);
      toast.success(t("layer_saved_successfully"));
    } catch (error) {
      console.error("Failed to save layer:", error);
      toast.error(t("layer_save_failed"));
    } finally {
      setIsSaving(false);
    }
  }, [onSaveNode, id, isSaving, t]);

  // Fetch process description to determine inputs
  const { process } = useProcessDescription(data.processId);

  // Identify layer inputs (inputs with widget: "layer-selector")
  const layerInputs = useMemo(() => {
    if (!process?.inputs) return [];

    return Object.entries(process.inputs)
      .filter(([, input]) => {
        const widget = input.schema?.["x-ui"]?.widget;
        // Include layer-selector and starting-points widgets as layer inputs
        return widget === "layer-selector" || widget === "starting-points";
      })
      .map(([name, input]) => {
        // Extract data type info from metadata
        const dataTypeInfo = extractInputDataType(input);
        return {
          name,
          title: input.title,
          section: input.schema?.["x-ui"]?.section || "input",
          required: input.minOccurs > 0,
          dataTypeInfo,
        };
      })
      .sort((a, b) => {
        // Sort by section order: input first, then overlay
        if (a.section === "input" && b.section !== "input") return -1;
        if (b.section === "input" && a.section !== "input") return 1;
        return 0;
      });
  }, [process]);

  // Get output data type info
  const outputDataType = useMemo(() => {
    if (!process?.outputs?.result) return undefined;
    return extractOutputDataType(process.outputs.result);
  }, [process]);

  // Check which inputs are missing connections
  const missingLayerInputs = useMemo(() => {
    if (layerInputs.length === 0) return [];

    // Get edges targeting this node
    const incomingEdges = edges.filter((e) => e.target === id);

    return layerInputs.filter((input) => {
      // Check if there's an edge connected to this input handle
      const isConnected = incomingEdges.some(
        (e) => e.targetHandle === input.name || (!e.targetHandle && layerInputs.length === 1)
      );
      return !isConnected && input.required;
    });
  }, [layerInputs, edges, id]);

  // Check which required config fields are missing values
  const missingConfig = useMemo(() => {
    if (!process?.inputs) return [];
    const config = data.config || {};

    const missing: { name: string; label: string }[] = [];

    for (const [name, input] of Object.entries(process.inputs)) {
      const uiMeta = input.schema?.["x-ui"];

      // Skip hidden fields and layer-related inputs
      if (uiMeta?.hidden) continue;
      if (uiMeta?.widget === "layer-selector") continue;
      if (uiMeta?.widget === "layer-name-input") continue;
      if (uiMeta?.widget === "starting-points") continue;
      if (uiMeta?.widget === "scenario-selector") continue;
      if (uiMeta?.section === "output") continue;
      if (uiMeta?.section === "result") continue;
      if (uiMeta?.section === "scenario") continue;

      // Check visible_when - skip if not visible
      if (uiMeta?.visible_when && !evaluateCondition(uiMeta.visible_when, config)) {
        continue;
      }
      // Check hidden_when - skip if hidden
      if (uiMeta?.hidden_when && evaluateCondition(uiMeta.hidden_when, config)) {
        continue;
      }

      // Check if required and missing
      const isRequired = input.minOccurs > 0;
      const value = config[name];
      const isEmpty =
        value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);

      if (isRequired && isEmpty) {
        const label = uiMeta?.label ? t(uiMeta.label) : input.title;
        missing.push({ name, label });
      }
    }

    return missing;
  }, [process, data.config, t]);

  const hasWarning = missingLayerInputs.length > 0 || missingConfig.length > 0;

  // Get display parameters (non-layer, non-hidden parameters with values)
  const displayParams = useMemo(() => {
    if (!process?.inputs || !data.config) return [];

    const params: { name: string; label: string; value: string }[] = [];
    const seenLabels = new Set<string>(); // Track seen labels to avoid duplicates

    for (const [name, input] of Object.entries(process.inputs)) {
      const uiMeta = input.schema?.["x-ui"];

      // Skip hidden fields
      if (uiMeta?.hidden) continue;

      // Skip layer-related widgets
      if (uiMeta?.widget === "layer-selector") continue;
      if (uiMeta?.widget === "layer-name-input") continue;
      if (uiMeta?.widget === "starting-points") continue;
      if (uiMeta?.widget === "scenario-selector") continue;
      if (typeof uiMeta?.widget === "string" && uiMeta.widget.includes("layer")) continue;

      // Skip layer-related sections
      if (uiMeta?.section === "output") continue;
      if (uiMeta?.section === "result") continue;
      if (uiMeta?.section === "scenario") continue;

      // Skip inputs with layer-related keywords or opportunities
      const keywords = (input.schema as { keywords?: string[] })?.keywords;
      if (
        keywords?.some((k) => {
          const lower = k.toLowerCase();
          return lower.includes("layer") || lower.includes("opportunit");
        })
      )
        continue;

      // Skip fields named with layer/opportunity patterns
      const nameLower = name.toLowerCase();
      if (nameLower.includes("layer") || nameLower.includes("opportunit")) continue;

      // Check visible_when condition - only show if condition is met
      if (uiMeta?.visible_when && !evaluateCondition(uiMeta.visible_when, data.config)) {
        continue;
      }

      // Check hidden_when condition - hide if condition is met
      if (uiMeta?.hidden_when && evaluateCondition(uiMeta.hidden_when, data.config)) {
        continue;
      }

      // Get value from config
      const value = data.config[name];
      if (value === undefined || value === null || value === "") continue;

      // Get label for this input
      const label = uiMeta?.label ? t(uiMeta.label) : input.title;

      // Skip if we've already seen this label (mutually exclusive fields)
      if (seenLabels.has(label)) continue;
      seenLabels.add(label);

      // Format the value for display
      let displayValue: string;
      if (typeof value === "boolean") {
        displayValue = value ? t("enabled") : t("disabled");
      } else if (Array.isArray(value)) {
        if (value.length === 0) continue; // Skip empty arrays
        // For arrays, join and truncate if too long
        const joined = value
          .map((v) => {
            // Translate enum labels for array items if available
            const enumLabels = uiMeta?.enum_labels as Record<string, string> | undefined;
            if (enumLabels && enumLabels[String(v)]) {
              return t(enumLabels[String(v)], { defaultValue: enumLabels[String(v)] });
            }
            return String(v);
          })
          .join(", ");
        displayValue = joined.length > 40 ? `${joined.substring(0, 37)}...` : joined;
      } else if (typeof value === "object") {
        continue; // Skip complex objects
      } else {
        // Check for enum labels
        const enumLabels = uiMeta?.enum_labels as Record<string, string> | undefined;
        if (enumLabels && enumLabels[String(value)]) {
          displayValue = t(enumLabels[String(value)], { defaultValue: enumLabels[String(value)] });
        } else {
          displayValue = String(value);
        }
      }

      // Truncate long values
      if (displayValue.length > 40) {
        displayValue = `${displayValue.substring(0, 37)}...`;
      }

      params.push({
        name,
        label,
        value: displayValue,
      });
    }

    // Limit to first 5 parameters to avoid huge nodes
    return params.slice(0, 5);
  }, [process, data.config, t]);

  // Handle duplicate node
  const handleDuplicate = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      const node = nodes.find((n) => n.id === id);
      if (!node) return;

      dispatch(
        addNode({
          ...node,
          id: `tool-${uuidv4()}`,
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

  // Get expected input handles from incoming edges (for when process hasn't loaded yet)
  const edgeDerivedHandles = useMemo(() => {
    const incomingEdges = edges.filter((e) => e.target === id);
    return incomingEdges
      .map((e) => e.targetHandle)
      .filter((h): h is string => h !== null && h !== undefined && h !== "input");
  }, [edges, id]);

  // Combine layer inputs with edge-derived handles for rendering
  // This ensures handles exist even before process description loads
  const effectiveInputHandles = useMemo(() => {
    if (layerInputs.length > 0) {
      return layerInputs;
    }
    // If no process loaded yet, create placeholder handles from edges
    if (edgeDerivedHandles.length > 0) {
      return edgeDerivedHandles.map((name) => ({
        name,
        title: name,
        section: "input" as const,
        required: true,
        dataTypeInfo: undefined,
      }));
    }
    return [];
  }, [layerInputs, edgeDerivedHandles]);

  // Calculate handle positions for multiple inputs
  const inputHandleCount = effectiveInputHandles.length || 1; // Default to 1 if no process loaded yet

  // Warning message for tooltip - combine missing layers and missing config
  const warningMessage = useMemo(() => {
    const parts: string[] = [];

    if (missingLayerInputs.length > 0) {
      parts.push(
        t("missing_layer_connections") + ": " + missingLayerInputs.map((input) => input.title).join(", ")
      );
    }

    if (missingConfig.length > 0) {
      parts.push(t("missing_required_config") + ": " + missingConfig.map((c) => c.label).join(", "));
    }

    return parts.join(". ");
  }, [missingLayerInputs, missingConfig, t]);

  return (
    <>
      {/* Global styles for @property --border-angle */}
      <BorderAnglePropertyStyles />
      {/* NodeToolbar - automatically shown when selected */}
      <NodeToolbar position={Position.Top} align="end">
        <ToolbarContainer>
          {/* Save button - shown when node has temp results */}
          {hasTempResult && (
            <>
              <Tooltip title={t("save_layer")} placement="top" arrow>
                <RunButton
                  size="small"
                  variant="contained"
                  color="success"
                  startIcon={
                    isSaving ? <CircularProgress size={14} color="inherit" /> : <SaveIcon fontSize="small" />
                  }
                  onClick={handleSave}
                  disabled={isSaving}>
                  {t("save")}
                </RunButton>
              </Tooltip>
              <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
            </>
          )}
          <Tooltip title={t("run_node")} placement="top" arrow>
            <RunButton size="small" variant="text" startIcon={<PlayIcon fontSize="small" />}>
              {t("run_node")}
            </RunButton>
          </Tooltip>
          <Tooltip title={t("run_to_here")} placement="top" arrow>
            <RunButton size="small" variant="text" startIcon={<RunToHereIcon fontSize="small" />}>
              {t("run_to_here")}
            </RunButton>
          </Tooltip>
          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
          <Tooltip title={t("duplicate")} placement="top" arrow>
            <ToolbarButton onClick={handleDuplicate}>
              <DuplicateIcon fontSize="small" />
            </ToolbarButton>
          </Tooltip>
          <Tooltip title={t("delete")} placement="top" arrow>
            <ToolbarButton onClick={handleDelete}>
              <DeleteIcon fontSize="small" color="error" />
            </ToolbarButton>
          </Tooltip>
        </ToolbarContainer>
      </NodeToolbar>

      <NodeContainer selected={selected}>
        {/* Warning badge for missing inputs/config */}
        {hasWarning && !nodeStatus && (
          <Tooltip title={warningMessage} arrow>
            <WarningBadge>
              <WarningIcon sx={{ fontSize: 16 }} />
            </WarningBadge>
          </Tooltip>
        )}

        {/* Input handles - positioned vertically based on count */}
        {inputHandleCount === 1 ? (
          <Tooltip
            title={
              effectiveInputHandles[0]
                ? `${effectiveInputHandles[0].title}${effectiveInputHandles[0].dataTypeInfo ? ` (${formatDataType(effectiveInputHandles[0].dataTypeInfo)})` : ""}`
                : ""
            }
            placement="top"
            arrow>
            <StyledHandle
              type="target"
              position={Position.Left}
              id={effectiveInputHandles[0]?.name || "input"}
              selected={selected}
            />
          </Tooltip>
        ) : (
          effectiveInputHandles.map((input, index) => (
            <Tooltip
              key={input.name}
              title={`${input.title}${input.dataTypeInfo ? ` (${formatDataType(input.dataTypeInfo)})` : ""}`}
              placement="top"
              arrow>
              <StyledHandle
                type="target"
                position={Position.Left}
                id={input.name}
                selected={selected}
                style={{
                  top: `${((index + 1) / (inputHandleCount + 1)) * 100}%`,
                }}
              />
            </Tooltip>
          ))
        )}

        {/* Output handle - right */}
        <Tooltip
          title={`${t("output")} (${outputDataType ? formatDataType(outputDataType) : "any"})`}
          placement="top"
          arrow>
          <StyledHandle type="source" position={Position.Right} id="output" selected={selected} />
        </Tooltip>

        <NodeHeader>
          <AnimatedBorderWrapper isRunning={nodeStatus === "running"}>
            <NodeIconWrapper status={nodeStatus}>
              <ToolSettingsIcon
                sx={{
                  fontSize: 20,
                  color:
                    nodeStatus === "completed"
                      ? "primary.main"
                      : nodeStatus === "failed"
                        ? "error.main"
                        : nodeStatus === "running"
                          ? "warning.main"
                          : "inherit",
                }}
              />
              {/* Checkmark badge on icon */}
              {nodeStatus === "completed" && (
                <IconStatusBadge>
                  <CheckCircleIcon sx={{ fontSize: 12 }} />
                </IconStatusBadge>
              )}
            </NodeIconWrapper>
          </AnimatedBorderWrapper>
          <Typography variant="body2" fontWeight="bold" sx={{ flex: 1, wordBreak: "break-word" }}>
            {process?.title || t(data.processId, { defaultValue: data.label })}
          </Typography>
          {/* Duration chip - shown when completed */}
          {nodeStatus === "completed" && executionInfo?.durationMs && (
            <Chip
              label={formatDuration(executionInfo.durationMs)}
              size="small"
              color="primary"
              sx={{
                height: 20,
                fontSize: "0.7rem",
                fontWeight: "bold",
                ml: 1,
                "& .MuiChip-label": {
                  px: 1,
                },
              }}
            />
          )}
        </NodeHeader>

        {/* Show configured parameters */}
        {displayParams.length > 0 && (
          <>
            <Divider sx={{ my: 1 }} />
            <Stack spacing={0.25}>
              {displayParams.map((param) => (
                <ParamRow key={param.name}>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{
                      flexShrink: 1,
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={param.label}>
                    {param.label}:
                  </Typography>
                  <Typography
                    variant="caption"
                    fontWeight="medium"
                    sx={{
                      flexShrink: 0,
                      textAlign: "right",
                      whiteSpace: "nowrap",
                    }}
                    title={param.value}>
                    {param.value}
                  </Typography>
                </ParamRow>
              ))}
            </Stack>
          </>
        )}

        {/* Show error message if failed */}
        {data.status === "error" && data.error && (
          <Typography
            variant="caption"
            color="error.main"
            sx={{
              display: "block",
              mt: 0.5,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
            title={data.error}>
            {data.error}
          </Typography>
        )}

        {/* Show job ID when running or completed */}
        {data.jobId && (data.status === "running" || data.status === "completed") && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 0.5 }}>
            <Icon iconName={ICON_NAME.CIRCLEINFO} sx={{ fontSize: 10, opacity: 0.5 }} />
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 9, opacity: 0.7 }} noWrap>
              Job: {data.jobId.substring(0, 8)}...
            </Typography>
          </Box>
        )}
      </NodeContainer>
    </>
  );
};

export default memo(ToolNode);
