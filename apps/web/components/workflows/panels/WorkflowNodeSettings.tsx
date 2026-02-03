"use client";

/**
 * Workflow Node Settings Panel
 *
 * Shows configuration for a selected workflow node.
 * For tool nodes, displays the same inputs as GenericTool.
 * For dataset nodes, delegates to DatasetNodeSettings.
 */
import { Box, CircularProgress, Stack, Typography, useTheme } from "@mui/material";
import { useEdges } from "@xyflow/react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDispatch, useSelector } from "react-redux";

import { ICON_NAME } from "@p4b/ui/components/Icon";

import type { AppDispatch, RootState } from "@/lib/store";
import { selectNodes } from "@/lib/store/workflow/selectors";
import { updateNode } from "@/lib/store/workflow/slice";
import {
  getDefaultValues,
  getVisibleInputs,
  isSectionEnabled,
  processInputsWithSections,
} from "@/lib/utils/ogc-utils";
import type { ProjectLayer } from "@/lib/validations/project";
import type { WorkflowNode } from "@/lib/validations/workflow";

import type { ProcessedSection } from "@/types/map/ogc-processes";

import { useFilteredProjectLayers } from "@/hooks/map/LayerPanelHooks";
import { useProcessDescription } from "@/hooks/map/useOgcProcesses";

import Container from "@/components/map/panels/Container";
import SectionHeader from "@/components/map/panels/common/SectionHeader";
import SectionOptions from "@/components/map/panels/common/SectionOptions";
import ToolsHeader from "@/components/map/panels/common/ToolsHeader";
import { GenericInput } from "@/components/map/panels/toolbox/generic/inputs";
import DatasetNodeSettings from "@/components/workflows/panels/DatasetNodeSettings";

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

  // Get edges to detect connected inputs
  const edges = useEdges();

  // Get all nodes from redux store for tracing connections
  const nodes = useSelector((state: RootState) => selectNodes(state));

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
            // Find layer by numeric ID
            const numericId = parseInt(sourceLayerId, 10);
            const layer = layers.find((l) => l.id === numericId);
            computed[`_${input.name}_has_geometry`] = !!layer?.feature_layer_geometry_type;
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
            // Find layer by numeric ID and get its dataset ID (layer_id)
            const numericId = parseInt(sourceLayerId, 10);
            const layer = layers.find((l) => l.id === numericId);
            if (layer?.layer_id) {
              mapping[input.name] = layer.layer_id;
            }
          }
          // For tool outputs, we can't determine fields until execution
          // TODO: Could store output schema in tool results for this
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
      <Container
        header={<ToolsHeader onBack={onBack} title={process.title} />}
        disablePadding={false}
        body={
          <Box sx={{ display: "flex", flexDirection: "column" }}>
            {/* Description */}
            <Typography variant="body2" sx={{ fontStyle: "italic", mb: theme.spacing(4) }}>
              {process.description}
            </Typography>

            {/* Render sections dynamically */}
            {sections.map((section) => {
              // In workflows, skip sections that are handled by node connections
              // Starting points and opportunities come from connected input nodes
              const workflowHiddenSections = ["starting", "opportunities"];
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
          </Box>
        }
      />
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
