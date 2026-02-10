"use client";

/**
 * Workflow Node Settings Panel
 *
 * Shows configuration for a selected workflow node.
 * For tool nodes, displays the same inputs as GenericTool.
 * For dataset nodes, delegates to DatasetNodeSettings.
 */
import { CheckCircle as CheckCircleIcon } from "@mui/icons-material";
import {
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Divider,
  FormControlLabel,
  Stack,
  TextField,
  Typography,
  useTheme,
} from "@mui/material";
import { useEdges } from "@xyflow/react";
import { formatDistance } from "date-fns";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDispatch, useSelector } from "react-redux";
import { toast } from "react-toastify";

import { ICON_NAME, Icon } from "@p4b/ui/components/Icon";

import { useDateFnsLocale } from "@/i18n/utils";

import { predictNodeSchema, useTempLayerFeatures, useWorkflowMetadata } from "@/lib/api/workflows";
import type { InputSchemaInfo } from "@/lib/api/workflows";
import type { AppDispatch, RootState } from "@/lib/store";
import {
  selectActiveDataPanelView,
  selectNodes,
  selectSelectedWorkflowId,
} from "@/lib/store/workflow/selectors";
import { requestMapView, requestTableView, updateNode } from "@/lib/store/workflow/slice";
import {
  getDefaultValues,
  getVisibleInputs,
  isSectionEnabled,
  processInputsWithSections,
} from "@/lib/utils/ogc-utils";
import type { ProjectLayer } from "@/lib/validations/project";
import type { ExportNodeData, WorkflowNode } from "@/lib/validations/workflow";

import type { ProcessedSection } from "@/types/map/ogc-processes";

import { useFilteredProjectLayers } from "@/hooks/map/LayerPanelHooks";
import { useProcessDescription } from "@/hooks/map/useOgcProcesses";

import Container from "@/components/map/panels/Container";
import SectionHeader from "@/components/map/panels/common/SectionHeader";
import SectionOptions from "@/components/map/panels/common/SectionOptions";
import ToolsHeader from "@/components/map/panels/common/ToolsHeader";
import { GenericInput } from "@/components/map/panels/toolbox/generic/inputs";
import { useWorkflowExecutionContext } from "@/components/workflows/context/WorkflowExecutionContext";
import SaveDatasetDialog from "@/components/workflows/dialogs/SaveDatasetDialog";
import DatasetNodeSettings from "@/components/workflows/panels/DatasetNodeSettings";
import SqlToolSettings from "@/components/workflows/panels/SqlToolSettings";

// Map section icons from backend to ICON_NAME
const SECTION_ICON_MAP: Record<string, ICON_NAME> = {
  layers: ICON_NAME.LAYERS,
  route: ICON_NAME.ROUTE,
  settings: ICON_NAME.SETTINGS,
  hexagon: ICON_NAME.HEXAGON,
  table: ICON_NAME.TABLE,
  tag: ICON_NAME.BOOKMARK,
  grid: ICON_NAME.TABLE,
  list: ICON_NAME.LIST,
  globe: ICON_NAME.GLOBE,
  upload: ICON_NAME.UPLOAD,
  download: ICON_NAME.DOWNLOAD,
  location: ICON_NAME.LOCATION,
  "location-marker": ICON_NAME.LOCATION_MARKER,
  aggregate: ICON_NAME.AGGREGATE,
  chart: ICON_NAME.CHART,
  scenario: ICON_NAME.SCENARIO,
  clock: ICON_NAME.CLOCK,
  save: ICON_NAME.SAVE,
};

const getSectionIcon = (section: ProcessedSection): ICON_NAME => {
  if (section.icon && SECTION_ICON_MAP[section.icon]) {
    return SECTION_ICON_MAP[section.icon];
  }
  return ICON_NAME.CIRCLEINFO;
};

interface WorkflowNodeSettingsProps {
  node: WorkflowNode;
  projectLayers?: ProjectLayer[];
  onBack: () => void;
}

export default function WorkflowNodeSettings({
  node,
  projectLayers = [],
  onBack,
}: WorkflowNodeSettingsProps) {
  const { t } = useTranslation("common");
  const theme = useTheme();
  const dispatch = useDispatch<AppDispatch>();
  const { projectId } = useParams();
  const dateLocale = useDateFnsLocale();

  // Get edges to detect connected inputs
  const edges = useEdges();

  // Get all nodes from redux store for tracing connections
  const nodes = useSelector((state: RootState) => selectNodes(state));

  // Get current workflow ID for metadata API
  const workflowId = useSelector(selectSelectedWorkflowId);

  // Fetch workflow metadata (columns from executed nodes)
  const { metadata: workflowMetadata } = useWorkflowMetadata(workflowId ?? undefined);

  // Get execution context for status and temp layer info
  const { nodeStatuses, nodeExecutionInfo, tempLayerIds, onSaveNode } = useWorkflowExecutionContext();

  // Track active data panel view for button selected state
  const activeDataPanelView = useSelector(selectActiveDataPanelView);

  // Get execution status for this node
  const nodeStatus = nodeStatuses[node.id];
  const executionInfo = nodeExecutionInfo[node.id];
  const tempLayerId = tempLayerIds[node.id];
  const hasTempResult = !!tempLayerId;

  // Parse temp layer ID to extract layer UUID
  const tempLayerUuid = useMemo(() => {
    if (!tempLayerId) return undefined;
    const parts = tempLayerId.split(":");
    return parts.length === 3 ? parts[2] : undefined;
  }, [tempLayerId]);

  // Fetch temp layer data for metadata (features count, geometry types)
  const { data: tempLayerData } = useTempLayerFeatures(hasTempResult ? tempLayerUuid : undefined, {
    limit: 1, // Just need metadata, not all features
  });

  // Derive metadata from temp layer response
  const tempLayerMetadata = useMemo(() => {
    if (!tempLayerData) return null;

    const featureCount = tempLayerData.numberMatched ?? tempLayerData.features?.length ?? 0;

    // Derive geometry types from first feature
    const geometryTypes = new Set<string>();
    if (tempLayerData.features?.length) {
      const feature = tempLayerData.features[0] as { geometry?: { type?: string } };
      if (feature?.geometry?.type) {
        geometryTypes.add(feature.geometry.type);
      }
    }

    return {
      featureCount,
      geometryTypes: Array.from(geometryTypes),
    };
  }, [tempLayerData]);

  // Save dataset dialog state
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Handle save dataset
  const handleSaveDataset = useCallback(
    async (name: string) => {
      if (!onSaveNode) {
        toast.error(t("save_failed"));
        return;
      }
      setIsSaving(true);
      try {
        await onSaveNode(node.id, name);
        // Note: success toast is shown when the finalize job completes (handled by useJobStatus)
      } catch (error) {
        console.error("Failed to save layer:", error);
        toast.error(t("layer_save_failed"));
        throw error;
      } finally {
        setIsSaving(false);
      }
    },
    [onSaveNode, node.id, t]
  );

  // For tool nodes, fetch process description
  const processId = node.type === "tool" && node.data.type === "tool" ? node.data.processId : undefined;
  const { process, isLoading: isLoadingProcess } = useProcessDescription(processId);

  // Project layers for geometry type detection
  const { layers: fetchedLayers } = useFilteredProjectLayers(projectId as string);
  const layers = fetchedLayers || projectLayers;

  // Initialize values from node data or defaults
  const defaultValues = useMemo(() => {
    if (!process) return {};
    return getDefaultValues(process);
  }, [process]);

  // Detect connected layer inputs and create virtual values for them
  // This ensures depends_on conditions like {input_layer_id: {$ne: None}} are satisfied
  const connectedLayerValues = useMemo(() => {
    if (!process?.inputs) return {};

    const virtualValues: Record<string, string> = {};

    // Get incoming edges to this node
    const incomingEdges = edges.filter((e) => e.target === node.id);

    // Find layer inputs (widgets: layer-selector, starting-points)
    for (const [name, input] of Object.entries(process.inputs)) {
      const widget = input.schema?.["x-ui"]?.widget;
      if (widget === "layer-selector" || widget === "starting-points") {
        // Check if this input has a connection
        const isConnected = incomingEdges.some(
          (e) => e.targetHandle === name || (!e.targetHandle && Object.keys(process.inputs).length === 1)
        );
        if (isConnected) {
          // Set a placeholder value to satisfy depends_on conditions
          virtualValues[name] = "__connected__";
        }
      }
    }

    return virtualValues;
  }, [process, edges, node.id]);

  // Form state - initialize with node's saved config or defaults
  // Use node.id as key to ensure state resets when switching nodes
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    if (node.type === "tool" && node.data.type === "tool" && node.data.config) {
      return node.data.config;
    }
    return {};
  });

  // Layer filters state (for future use when executing tools)
  const [_layerFilters, setLayerFilters] = useState<Record<string, Record<string, unknown> | undefined>>({});

  // Nested layer filters for repeatable objects (for future use)
  const [_nestedLayerFilters, setNestedLayerFilters] = useState<
    Record<string, Record<string, Record<string, unknown> | undefined>[]>
  >({});

  // Section collapse state
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  // Advanced options collapse state
  const [advancedCollapsed, setAdvancedCollapsed] = useState<Record<string, boolean>>({});

  // Process inputs into sections
  const sections = useMemo(() => {
    if (!process) return [];
    return processInputsWithSections(process);
  }, [process]);

  // Initialize values when process loads (but preserve node's saved values)
  useEffect(() => {
    if (process) {
      const defaults = getDefaultValues(process);
      setValues((prev) => {
        // Merge defaults with existing values (node config takes precedence)
        return { ...defaults, ...prev };
      });

      // Initialize collapsed states
      const collapsed: Record<string, boolean> = {};
      const advCollapsed: Record<string, boolean> = {};
      for (const section of sections) {
        collapsed[section.id] = section.collapsed;
        advCollapsed[section.id] = true;
      }
      setCollapsedSections(collapsed);
      setAdvancedCollapsed(advCollapsed);
    }
  }, [process, sections]);

  // Get all inputs from all sections
  const allInputs = useMemo(() => {
    return sections.flatMap((section) => section.inputs);
  }, [sections]);

  // Helper to get layer ID from a connected source node
  const getLayerIdFromSourceNode = useCallback(
    (inputName: string): string | undefined => {
      // Find the edge that connects to this input
      const edge = edges.find(
        (e) =>
          e.target === node.id &&
          (e.targetHandle === inputName || (!e.targetHandle && allInputs.length === 1))
      );
      if (!edge) return undefined;

      // Find the source node
      const sourceNode = nodes.find((n) => n.id === edge.source);
      if (!sourceNode) return undefined;

      // If source is a dataset node, get its configured layerId
      if (sourceNode.data?.type === "dataset" && sourceNode.data?.layerId) {
        return sourceNode.data.layerId as string;
      }

      // If source is a tool node with temp result, assume it has geometry
      // (tool outputs generally preserve geometry type)
      if (sourceNode.data?.type === "tool") {
        return "__tool_output__"; // Special marker to indicate tool output (has geometry)
      }

      return undefined;
    },
    [edges, node.id, nodes, allInputs.length]
  );

  // Compute layer geometry types for visibility conditions
  const layerGeometryValues = useMemo(() => {
    if (!layers) return {};

    const computed: Record<string, boolean> = {};
    const effectiveValues = { ...defaultValues, ...connectedLayerValues, ...values };

    for (const input of allInputs) {
      if (input.inputType === "layer") {
        const projectLayerId = effectiveValues[input.name] as string | undefined;

        // Check if this is a connected input
        if (projectLayerId === "__connected__") {
          // Trace to source node to get actual layer ID
          const sourceLayerId = getLayerIdFromSourceNode(input.name);

          if (sourceLayerId === "__tool_output__") {
            // Tool outputs generally have geometry
            computed[`_${input.name}_has_geometry`] = true;
          } else if (sourceLayerId) {
            // sourceLayerId could be a UUID (layer_id) or numeric project layer ID
            const isUUID = sourceLayerId.includes("-") && sourceLayerId.length > 20;

            if (isUUID) {
              // Find layer by layer_id (UUID)
              const layer = layers.find((l) => l.layer_id === sourceLayerId);
              computed[`_${input.name}_has_geometry`] = !!layer?.feature_layer_geometry_type;
            } else {
              // Find layer by numeric ID
              const numericId = parseInt(sourceLayerId, 10);
              const layer = layers.find((l) => l.id === numericId);
              computed[`_${input.name}_has_geometry`] = !!layer?.feature_layer_geometry_type;
            }
          } else {
            // Connected but can't determine - assume has geometry for better UX
            computed[`_${input.name}_has_geometry`] = true;
          }
        } else if (projectLayerId) {
          // Direct layer selection
          const numericId = parseInt(projectLayerId, 10);
          const layer = layers.find((l) => l.id === numericId);
          computed[`_${input.name}_has_geometry`] = !!layer?.feature_layer_geometry_type;
        } else {
          computed[`_${input.name}_has_geometry`] = false;
        }
      }
    }

    const geometryFlags = Object.values(computed);
    computed["_any_layer_has_geometry"] = geometryFlags.some((v) => v === true);
    computed["_all_layers_have_geometry"] =
      geometryFlags.length > 0 && geometryFlags.every((v) => v === true);

    return computed;
  }, [layers, allInputs, values, defaultValues, connectedLayerValues, getLayerIdFromSourceNode]);

  // Compute dataset IDs for layer inputs (needed for field selectors)
  // This maps layer input names to their dataset IDs, handling connected inputs
  const layerDatasetIds = useMemo(() => {
    if (!layers) return {};

    const mapping: Record<string, string> = {};
    const effectiveValues = { ...defaultValues, ...connectedLayerValues, ...values };

    for (const input of allInputs) {
      if (input.inputType === "layer") {
        const projectLayerId = effectiveValues[input.name] as string | undefined;

        if (projectLayerId === "__connected__") {
          // Trace to source node to get actual layer ID
          const sourceLayerId = getLayerIdFromSourceNode(input.name);

          if (sourceLayerId && sourceLayerId !== "__tool_output__") {
            // sourceLayerId could be:
            // 1. A numeric project layer ID (e.g., "123")
            // 2. A UUID layer_id/dataset_id (e.g., "16235883-3477-49fc-a7a5-796d7048f0c1")

            // Check if it's a UUID (contains dashes and is longer than typical numeric IDs)
            const isUUID = sourceLayerId.includes("-") && sourceLayerId.length > 20;

            if (isUUID) {
              // It's already a layer_id (dataset_id), use it directly
              mapping[input.name] = sourceLayerId;
            } else {
              // Find layer by numeric ID and get its dataset ID (layer_id)
              const numericId = parseInt(sourceLayerId, 10);
              const layer = layers.find((l) => l.id === numericId);
              if (layer?.layer_id) {
                mapping[input.name] = layer.layer_id;
              }
            }
          }
          // For tool outputs, we can't determine fields until execution
        } else if (projectLayerId) {
          // Direct layer selection
          const numericId = parseInt(projectLayerId, 10);
          const layer = layers.find((l) => l.id === numericId);
          if (layer?.layer_id) {
            mapping[input.name] = layer.layer_id;
          }
        }
      }
    }

    return mapping;
  }, [layers, allInputs, values, defaultValues, connectedLayerValues, getLayerIdFromSourceNode]);

  // Compute predicted columns for connected tool outputs
  // This enables field selectors to show fields from upstream tool nodes
  const [predictedColumns, setPredictedColumns] = useState<Record<string, Record<string, string>>>({});

  // Reset all state when node changes to ensure nodes are independent
  useEffect(() => {
    if (node.type === "tool" && node.data.type === "tool") {
      setValues(node.data.config || {});
    } else {
      setValues({});
    }
    // Reset predicted columns when node changes
    setPredictedColumns({});
  }, [node.id]); // Only reset when node ID changes

  // Use ref to track latest values without triggering effect re-runs
  const valuesRef = useRef<Record<string, unknown>>({});
  const defaultValuesRef = useRef<Record<string, unknown>>({});
  const connectedLayerValuesRef = useRef<Record<string, string>>({});
  const layersRef = useRef<ProjectLayer[] | undefined>(undefined);

  // Update refs when values change (doesn't trigger re-render)
  useEffect(() => {
    valuesRef.current = values;
    defaultValuesRef.current = defaultValues;
    connectedLayerValuesRef.current = connectedLayerValues;
    layersRef.current = layers;
  }, [values, defaultValues, connectedLayerValues, layers]);

  // Compute a stable key for when we need to re-fetch predictions
  // Only changes when graph structure changes (edges, nodes) or workflow metadata updates
  const connectedToolInputsKey = useMemo(() => {
    const connectedInputs: string[] = [];

    for (const input of allInputs) {
      if (input.inputType !== "layer") continue;

      // Check if this input has a connection
      const edge = edges.find(
        (e) =>
          e.target === node.id &&
          (e.targetHandle === input.name || (!e.targetHandle && allInputs.length === 1))
      );

      if (!edge) continue;

      const sourceNode = nodes.find((n) => n.id === edge.source);

      if (!sourceNode || sourceNode.data?.type !== "tool") continue;

      // Include source node info and its config hash in the key
      const sourceConfig = JSON.stringify(sourceNode.data.config || {});
      connectedInputs.push(`${input.name}:${sourceNode.id}:${sourceNode.data.processId}:${sourceConfig}`);
    }

    return connectedInputs.sort().join("|");
  }, [allInputs, edges, nodes, node.id]);

  // Track if fetch is in progress and the last key we fetched for
  const fetchInProgressRef = useRef(false);
  const lastFetchedKeyRef = useRef<string>("");

  // Effect to fetch predicted columns for connected tool outputs
  // Only runs when the stable key changes, not on every render
  useEffect(() => {
    if (!process || !workflowId || !connectedToolInputsKey) {
      return;
    }

    // Wait for layers to be available before fetching predictions
    // This ensures we can resolve layer_ids from dataset nodes
    if (!layers || layers.length === 0) {
      return;
    }

    // Create a complete fetch key including layers availability and node.id
    const fetchKey = `${node.id}:${connectedToolInputsKey}:${layers.length}`;

    // Skip if we already fetched for this exact key
    if (lastFetchedKeyRef.current === fetchKey) {
      return;
    }

    // Prevent duplicate fetches
    if (fetchInProgressRef.current) {
      return;
    }

    const fetchPredictedColumns = async () => {
      fetchInProgressRef.current = true;

      try {
        const newPredicted: Record<string, Record<string, string>> = {};
        // Use refs to get current values without them being dependencies
        const effectiveValues = {
          ...defaultValuesRef.current,
          ...connectedLayerValuesRef.current,
          ...valuesRef.current,
        };
        // Use layers directly since it's now a dependency
        const currentLayers = layers;

        for (const input of allInputs) {
          if (input.inputType !== "layer") continue;

          const projectLayerId = effectiveValues[input.name] as string | undefined;

          if (projectLayerId !== "__connected__") continue;

          // Find the edge to get source node
          const edge = edges.find(
            (e) =>
              e.target === node.id &&
              (e.targetHandle === input.name || (!e.targetHandle && allInputs.length === 1))
          );
          if (!edge) continue;

          const sourceNode = nodes.find((n) => n.id === edge.source);
          if (!sourceNode) continue;

          // Check if we have metadata from executed node
          if (workflowMetadata?.nodes[sourceNode.id]?.columns) {
            newPredicted[input.name] = workflowMetadata.nodes[sourceNode.id].columns!;
            continue;
          }

          // If source is a tool node, try to predict its output schema
          if (sourceNode.data?.type === "tool") {
            const sourceProcessId = sourceNode.data.processId as string;
            const sourceConfig = (sourceNode.data.config || {}) as Record<string, unknown>;

            try {
              // Build input schemas for the source node
              const inputSchemas: Record<string, InputSchemaInfo> = {};

              // Find source node's incoming edges to get its layer inputs
              const sourceEdges = edges.filter((e) => e.target === sourceNode.id);

              for (const srcEdge of sourceEdges) {
                const srcSourceNode = nodes.find((n) => n.id === srcEdge.source);

                if (srcSourceNode?.data?.type === "dataset" && srcSourceNode.data.layerId) {
                  // Dataset node - use its layer ID
                  const inputName = srcEdge.targetHandle || "input_layer_id";
                  const layerIdValue = srcSourceNode.data.layerId as string;

                  // layerId might be a UUID (layer_id) or a numeric project layer id
                  // Try to find by UUID first, then by numeric ID
                  let layer = currentLayers?.find((l) => l.layer_id === layerIdValue);
                  if (!layer) {
                    const numericId = parseInt(layerIdValue, 10);
                    if (!isNaN(numericId)) {
                      layer = currentLayers?.find((l) => l.id === numericId);
                    }
                  }

                  // Use the layer_id (UUID) for the prediction, or use the value directly if it's already a UUID
                  const layerUuid = layer?.layer_id || layerIdValue;
                  if (layerUuid) {
                    inputSchemas[inputName] = { layer_id: layerUuid };
                  }
                } else if (srcSourceNode?.data?.type === "tool") {
                  // Another tool - check if executed
                  const inputName = srcEdge.targetHandle || "input_layer_id";
                  if (workflowMetadata?.nodes[srcSourceNode.id]?.columns) {
                    inputSchemas[inputName] = {
                      columns: workflowMetadata.nodes[srcSourceNode.id].columns!,
                    };
                  }
                }
              }

              const predicted = await predictNodeSchema(workflowId, {
                process_id: sourceProcessId,
                input_schemas: inputSchemas,
                params: sourceConfig,
              });

              if (predicted.columns && Object.keys(predicted.columns).length > 0) {
                newPredicted[input.name] = predicted.columns;
              }
            } catch (error) {
              console.warn(`Failed to predict schema for ${sourceProcessId}:`, error);
            }
          }
        }

        setPredictedColumns(newPredicted);
        // Mark this key as fetched
        lastFetchedKeyRef.current = fetchKey;
      } finally {
        fetchInProgressRef.current = false;
      }
    };

    fetchPredictedColumns();
    // Note: We intentionally exclude allInputs, edges, nodes, workflowMetadata from deps
    // because connectedToolInputsKey captures the relevant changes, and lastFetchedKeyRef
    // prevents duplicate fetches for the same configuration
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    process,
    workflowId,
    connectedToolInputsKey, // Stable key that only changes when graph structure changes
    node.id,
    layers, // Re-fetch when layers become available
  ]);

  // Update a single input value
  const handleInputChange = useCallback(
    (name: string, value: unknown) => {
      setValues((prev) => {
        const newValues = { ...prev, [name]: value };

        // Check for dynamic defaults
        for (const input of allInputs) {
          const defaultByField = input.uiMeta?.widget_options?.default_by_field as
            | { field: string; values: Record<string, unknown> }
            | undefined;

          if (defaultByField && defaultByField.field === name) {
            const dynamicDefault = defaultByField.values[String(value)];
            if (dynamicDefault !== undefined) {
              newValues[input.name] = dynamicDefault;
            }
          }
        }

        // Save to node data
        if (node.type === "tool") {
          dispatch(
            updateNode({
              id: node.id,
              changes: {
                data: {
                  ...node.data,
                  config: newValues,
                },
              },
            })
          );
        }

        return newValues;
      });
    },
    [allInputs, dispatch, node]
  );

  // Update filter for a layer input
  const handleFilterChange = useCallback((inputName: string, filter: Record<string, unknown> | undefined) => {
    setLayerFilters((prev) => ({
      ...prev,
      [inputName]: filter,
    }));
  }, []);

  // Update nested filters
  const handleNestedFiltersChange = useCallback(
    (inputName: string, filters: Record<string, Record<string, unknown> | undefined>[]) => {
      setNestedLayerFilters((prev) => ({
        ...prev,
        [inputName]: filters,
      }));
    },
    []
  );

  // Toggle section collapse
  const toggleSection = useCallback((sectionId: string) => {
    setCollapsedSections((prev) => ({
      ...prev,
      [sectionId]: !prev[sectionId],
    }));
  }, []);

  // Toggle advanced options collapse
  const toggleAdvanced = useCallback((sectionId: string) => {
    setAdvancedCollapsed((prev) => ({
      ...prev,
      [sectionId]: !prev[sectionId],
    }));
  }, []);

  // Render dataset node settings
  if (node.type === "dataset" && node.data.type === "dataset") {
    return <DatasetNodeSettings node={node} projectLayers={layers} onBack={onBack} />;
  }

  // Render export node settings (inline, same structure as tool nodes)
  if (node.type === "export" && node.data.type === "export") {
    const exportData = node.data as ExportNodeData;

    // Find upstream tool node
    const upstreamInfo = (() => {
      const incomingEdge = edges.find((e) => e.target === node.id);
      if (!incomingEdge) return null;
      const sourceNode = nodes.find((n) => n.id === incomingEdge.source);
      if (!sourceNode) return null;
      return {
        label: (sourceNode.data as { label?: string }).label || sourceNode.id,
      };
    })();

    return (
      <ExportNodeSettingsInline
        node={node}
        exportData={exportData}
        nodeStatus={nodeStatus}
        upstreamInfo={upstreamInfo}
        onBack={onBack}
      />
    );
  }

  // Render Custom SQL tool settings (special case)
  if (
    node.type === "tool" &&
    node.data.type === "tool" &&
    node.data.processId === "custom_sql"
  ) {
    return <SqlToolSettings node={node} onBack={onBack} />;
  }

  // Render tool node settings
  if (node.type === "tool" && node.data.type === "tool") {
    // Loading state
    if (isLoadingProcess) {
      return (
        <Container
          header={<ToolsHeader onBack={onBack} title={t("loading")} />}
          disablePadding={true}
          body={
            <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
              <CircularProgress />
            </Box>
          }
        />
      );
    }

    // No process found
    if (!process) {
      return (
        <Container
          header={<ToolsHeader onBack={onBack} title={node.data.label} />}
          disablePadding={false}
          body={
            <Typography variant="body2" color="text.secondary">
              {t("process_not_found")}
            </Typography>
          }
        />
      );
    }

    // Effective values for visibility
    // Include connectedLayerValues so depends_on conditions for connected inputs are satisfied
    const effectiveValues = { ...defaultValues, ...connectedLayerValues, ...values, ...layerGeometryValues };

    // Render sections with inputs (matching GenericTool pattern)
    return (
      <>
        <Container
          header={<ToolsHeader onBack={onBack} title={process.title} />}
          disablePadding={false}
          body={
            <Box sx={{ display: "flex", flexDirection: "column" }}>
              {/* Description */}
              <Typography variant="body2" sx={{ fontStyle: "italic", mb: theme.spacing(4) }}>
                {process.description}
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

              {/* Render sections dynamically */}
              {sections.map((section) => {
                // In workflows, skip sections that are handled by node connections or not applicable
                // Starting points and opportunities come from connected input nodes
                // Scenario and result sections are not supported in workflows
                const workflowHiddenSections = ["starting", "opportunities", "scenario", "result"];
                if (workflowHiddenSections.includes(section.id)) {
                  return null;
                }

                // Filter out layer inputs that should come from node connections
                const workflowHiddenWidgets = ["layer-selector", "starting-points"];
                const visibleInputs = getVisibleInputs(section.inputs, effectiveValues).filter(
                  (input) => !workflowHiddenWidgets.includes(input.uiMeta?.widget || "")
                );
                const sectionEnabled = isSectionEnabled(section, effectiveValues);

                // Skip empty sections
                if (visibleInputs.length === 0) {
                  return null;
                }

                // Split into base and advanced inputs
                const baseInputs = visibleInputs.filter((input) => !input.advanced);
                const advancedInputs = visibleInputs.filter((input) => input.advanced);
                const hasAdvancedOptions = advancedInputs.length > 0;

                const isCollapsed = collapsedSections[section.id] ?? section.collapsed;
                const isAdvancedCollapsed = advancedCollapsed[section.id] ?? true;
                const isFirstSection = sections.indexOf(section) === 0;
                const isDisabled = !sectionEnabled;

                return (
                  <Box
                    key={section.id}
                    sx={{
                      opacity: isDisabled ? 0.5 : 1,
                      pointerEvents: isDisabled ? "none" : "auto",
                      transition: "opacity 0.2s ease",
                    }}>
                    <SectionHeader
                      active={!isCollapsed && !isDisabled}
                      alwaysActive={!section.collapsible || isFirstSection}
                      label={section.label}
                      icon={getSectionIcon(section)}
                      disableAdvanceOptions={!hasAdvancedOptions}
                      collapsed={hasAdvancedOptions ? isAdvancedCollapsed : isCollapsed || isDisabled}
                      setCollapsed={
                        hasAdvancedOptions
                          ? () => toggleAdvanced(section.id)
                          : section.collapsible
                            ? () => toggleSection(section.id)
                            : undefined
                      }
                      onToggleChange={
                        section.collapsible && !isFirstSection ? () => toggleSection(section.id) : undefined
                      }
                    />
                    {!isCollapsed && !isDisabled && (
                      <SectionOptions
                        active={true}
                        collapsed={isAdvancedCollapsed}
                        baseOptions={
                          <Stack spacing={2}>
                            {baseInputs.map((input) => (
                              <GenericInput
                                key={input.name}
                                input={input}
                                value={effectiveValues[input.name]}
                                onChange={(value) => handleInputChange(input.name, value)}
                                onFilterChange={
                                  input.inputType === "layer"
                                    ? (filter) => handleFilterChange(input.name, filter)
                                    : undefined
                                }
                                onNestedFiltersChange={
                                  input.inputType === "repeatable-object"
                                    ? (filters) => handleNestedFiltersChange(input.name, filters)
                                    : undefined
                                }
                                formValues={effectiveValues}
                                schemaDefs={process.$defs}
                                layerDatasetIds={layerDatasetIds}
                                predictedColumns={predictedColumns}
                              />
                            ))}
                          </Stack>
                        }
                        advancedOptions={
                          hasAdvancedOptions ? (
                            <Stack spacing={2}>
                              {advancedInputs.map((input) => (
                                <GenericInput
                                  key={input.name}
                                  input={input}
                                  value={effectiveValues[input.name]}
                                  onChange={(value) => handleInputChange(input.name, value)}
                                  onFilterChange={
                                    input.inputType === "layer"
                                      ? (filter) => handleFilterChange(input.name, filter)
                                      : undefined
                                  }
                                  onNestedFiltersChange={
                                    input.inputType === "repeatable-object"
                                      ? (filters) => handleNestedFiltersChange(input.name, filters)
                                      : undefined
                                  }
                                  formValues={effectiveValues}
                                  schemaDefs={process.$defs}
                                  layerDatasetIds={layerDatasetIds}
                                  predictedColumns={predictedColumns}
                                />
                              ))}
                            </Stack>
                          ) : undefined
                        }
                      />
                    )}
                  </Box>
                );
              })}

              {/* Dataset Details Section - shown for completed tools with results */}
              {nodeStatus === "completed" && hasTempResult && tempLayerMetadata && (
                <>
                  <Box sx={{ mt: 3, mb: 2 }}>
                    <Typography variant="body2" fontWeight="bold" color="text.secondary" sx={{ mb: 1 }}>
                      {t("dataset_details")}
                    </Typography>
                    <Divider sx={{ mb: 1.5 }} />
                  </Box>

                  <Stack spacing={1.5}>
                    {/* Created at */}
                    {executionInfo?.startedAt && (
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Typography variant="body2" color="text.secondary">
                          {t("created")}:
                        </Typography>
                        <Typography variant="body2">
                          {formatDistance(new Date(executionInfo.startedAt * 1000), new Date(), {
                            addSuffix: true,
                            locale: dateLocale,
                          })}
                        </Typography>
                      </Stack>
                    )}

                    {/* Features count */}
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Typography variant="body2" color="text.secondary">
                        {t("features")}:
                      </Typography>
                      <Typography variant="body2">
                        {tempLayerMetadata.featureCount.toLocaleString()}
                      </Typography>
                    </Stack>

                    {/* Geometry types */}
                    {tempLayerMetadata.geometryTypes.length > 0 && (
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Typography variant="body2" color="text.secondary">
                          {t("geometry_types")}:
                        </Typography>
                        <Typography variant="body2">{tempLayerMetadata.geometryTypes.join(", ")}</Typography>
                      </Stack>
                    )}
                  </Stack>
                </>
              )}

              {/* Actions Section - shown for completed tools with results */}
              {nodeStatus === "completed" && hasTempResult && (
                <>
                  <Box sx={{ mt: 3, mb: 2 }}>
                    <Typography variant="body2" fontWeight="bold" color="text.secondary" sx={{ mb: 1 }}>
                      {t("actions")}
                    </Typography>
                    <Divider sx={{ mb: 1.5 }} />
                  </Box>

                  <Stack spacing={1.5}>
                    <Stack direction="row" spacing={1}>
                      <Button
                        variant={activeDataPanelView === "table" ? "contained" : "outlined"}
                        size="small"
                        startIcon={<Icon iconName={ICON_NAME.TABLE} style={{ fontSize: 16 }} />}
                        onClick={() => dispatch(requestTableView())}
                        sx={{ borderRadius: 4, textTransform: "none", fontWeight: "bold", flex: 1 }}>
                        {t("table")}
                      </Button>
                      <Button
                        variant={activeDataPanelView === "map" ? "contained" : "outlined"}
                        size="small"
                        startIcon={<Icon iconName={ICON_NAME.MAP} style={{ fontSize: 16 }} />}
                        onClick={() => dispatch(requestMapView())}
                        sx={{ borderRadius: 4, textTransform: "none", fontWeight: "bold", flex: 1 }}>
                        {t("map")}
                      </Button>
                    </Stack>

                    <Button
                      variant="outlined"
                      size="small"
                      fullWidth
                      startIcon={<Icon iconName={ICON_NAME.LAYERS} style={{ fontSize: 16 }} />}
                      onClick={() => setSaveDialogOpen(true)}
                      sx={{ borderRadius: 4, textTransform: "none", fontWeight: "bold" }}>
                      {t("save_dataset")}
                    </Button>
                  </Stack>
                </>
              )}
            </Box>
          }
        />

        {/* Save Dataset Dialog */}
        <SaveDatasetDialog
          open={saveDialogOpen}
          onClose={() => setSaveDialogOpen(false)}
          onSave={handleSaveDataset}
          defaultName={process.title || node.data.label || ""}
          isSaving={isSaving}
        />
      </>
    );
  }

  // Fallback
  return (
    <Container
      header={<ToolsHeader onBack={onBack} title={t("node_settings")} />}
      disablePadding={false}
      body={
        <Typography variant="body2" color="text.secondary">
          {t("unknown_node_type")}
        </Typography>
      }
    />
  );
}

// ----- Export Node Settings (inline sub-component) -----

interface ExportNodeSettingsInlineProps {
  node: WorkflowNode;
  exportData: ExportNodeData;
  nodeStatus: string | undefined;
  upstreamInfo: { label: string } | null;
  onBack: () => void;
}

function ExportNodeSettingsInline({
  node,
  exportData,
  nodeStatus,
  upstreamInfo,
  onBack,
}: ExportNodeSettingsInlineProps) {
  const { t } = useTranslation("common");
  const theme = useTheme();
  const dispatch = useDispatch<AppDispatch>();

  // Local state for form values — provides instant UI updates.
  // Redux is updated as a side effect (same pattern as tool nodes).
  const [datasetName, setDatasetName] = useState(exportData.datasetName || "");
  const [addToProject, setAddToProject] = useState(exportData.addToProject);
  const [overwritePrevious, setOverwritePrevious] = useState(exportData.overwritePrevious);

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
    (e: { target: { value: string } }) => {
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
          {nodeStatus === "completed" && exportData.exportedLayerId && (
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
          {nodeStatus === "failed" && exportData.error && (
            <Box sx={{ mt: 3, mb: 2 }}>
              <Typography variant="body2" fontWeight="bold" color="text.secondary" sx={{ mb: 1 }}>
                {t("result")}
              </Typography>
              <Divider sx={{ mb: 1.5 }} />
              <Typography variant="body2" color="error.main">
                {exportData.error}
              </Typography>
            </Box>
          )}
        </Box>
      }
    />
  );
}
