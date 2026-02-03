/* eslint-disable @typescript-eslint/no-explicit-any */
import { Checkbox, FormControlLabel, Stack, Typography } from "@mui/material";
import { useParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";

import { ICON_NAME } from "@p4b/ui/components/Icon";

import { useProjectLayers } from "@/lib/api/projects";
import { formatNumber } from "@/lib/utils/format-number";
import { hasNestedSchemaPath } from "@/lib/utils/zod";
import type { FormatNumberTypes, WidgetConfigSchema } from "@/lib/validations/widget";
import { formatNumberTypes, widgetSchemaMap, widgetTypes } from "@/lib/validations/widget";

import type { SelectorItem } from "@/types/map/common";

import useLayerFields from "@/hooks/map/CommonHooks";
import { useLayerByGeomType, useLayerDatasetId } from "@/hooks/map/ToolsHooks";

import WidgetColorPicker from "@/components/builder/widgets/common/WidgetColorPicker";
import CategoryColorConfig from "@/components/builder/widgets/data/CategoryColorConfig";
import CategoryOrderConfig from "@/components/builder/widgets/data/CategoryOrderConfig";
import { TargetLayersConfig, WidgetFilterLayout } from "@/components/builder/widgets/data/DataConfig";
import LayerFieldSelector from "@/components/map/common/LayerFieldSelector";
import { StatisticSelector } from "@/components/map/common/StatisticSelector";
import SectionHeader from "@/components/map/panels/common/SectionHeader";
import SectionOptions from "@/components/map/panels/common/SectionOptions";
import Selector from "@/components/map/panels/common/Selector";
import TextFieldInput from "@/components/map/panels/common/TextFieldInput";

export interface WidgetConfigProps {
  active?: boolean;
  sectionLabel?: string;
  config: WidgetConfigSchema;
  onChange: (widget: WidgetConfigSchema) => void;
}

export const NumberFormatSelector = ({
  numberFormat,
  onNumberFormatChange,
}: {
  numberFormat?: FormatNumberTypes;
  onNumberFormatChange?: (format: FormatNumberTypes) => void;
}) => {
  const { t, i18n } = useTranslation("common");

  const numberFormats = useMemo(() => {
    return formatNumberTypes.options.map((format) => {
      let label = format as string;
      switch (format) {
        case "none":
          label = t("none");
          break;
        case "decimal_max":
          label = t("decimal_max");
          break;
        case "integer":
        case "compact":
        case "grouping":
          label = `${formatNumber(1000, format, i18n.language)}`;
          break;
        case "grouping_2d":
        case "signed_2d":
        case "compact_1d":
        case "currency_usd":
        case "currency_eur":
          label = `${formatNumber(12345.678, format, i18n.language)}`;
          break;
        case "percent":
        case "percent_1d":
        case "percent_2d":
          label = `${formatNumber(0.01, "none", i18n.language)} ${t("is")} ${formatNumber(0.01, format, i18n.language)}`;
          break;
        case "decimal_2":
        case "decimal_3":
          label = `${formatNumber(1.234, format, i18n.language)}`;
          break;
        default:
          break;
      }
      return {
        label,
        value: format,
      };
    });
  }, [i18n.language, t]);

  const selectedFormat = useMemo(() => {
    return numberFormat ? numberFormats.find((item) => item.value === numberFormat) : undefined;
  }, [numberFormat, numberFormats]);

  return (
    <Selector
      selectedItems={selectedFormat}
      setSelectedItems={(item: SelectorItem) => {
        onNumberFormatChange?.(item.value as FormatNumberTypes);
      }}
      items={numberFormats}
      label={t("number_format")}
    />
  );
};

export const WidgetInfo = ({ sectionLabel, config, onChange }: WidgetConfigProps) => {
  const { t } = useTranslation("common");
  const schema = widgetSchemaMap[config.type];
  const hasTitleDef = useMemo(() => {
    return hasNestedSchemaPath(schema, "setup.title");
  }, [schema]);

  const hasDescriptionDef = useMemo(() => {
    return hasNestedSchemaPath(schema, "options.description");
  }, [schema]);

  const hasAltTextDef = useMemo(() => {
    return hasNestedSchemaPath(schema, "setup.alt");
  }, [schema]);

  const handleConfigChange = useCallback(
    (parentKey: "setup" | "options", propertyKey: string, value: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const currentParent = (config as any)[parentKey] || {};
      const updatedParent = {
        ...currentParent,
        [propertyKey]: value,
      };
      onChange({
        ...config,
        [parentKey]: updatedParent,
      } as WidgetConfigSchema);
    },
    [config, onChange]
  );

  const hasInfo = useMemo(() => {
    return hasTitleDef || hasDescriptionDef || hasAltTextDef;
  }, [hasTitleDef, hasDescriptionDef, hasAltTextDef]);

  return (
    <>
      {hasInfo && (
        <>
          <SectionHeader
            active
            alwaysActive
            label={sectionLabel ?? t("info")}
            icon={ICON_NAME.CIRCLEINFO}
            disableAdvanceOptions
          />
          <SectionOptions
            active
            baseOptions={
              <>
                {hasTitleDef && (
                  <TextFieldInput
                    type="text"
                    label={t("title")}
                    placeholder={t("add_widget_title")}
                    clearable={false}
                    // Safely access title, using 'as any' for now to match context
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    value={(config.setup as any)?.title || ""}
                    onChange={(value: string) => {
                      handleConfigChange("setup", "title", value);
                    }}
                  />
                )}
                {hasDescriptionDef && (
                  <TextFieldInput
                    type="text"
                    label={t("description")}
                    placeholder={t("add_widget_description")}
                    multiline
                    clearable={false}
                    // Safely access description, using 'as any' for now to match context
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    value={(config as any)?.options?.description || ""}
                    onChange={(value: string) => {
                      handleConfigChange("options", "description", value);
                    }}
                  />
                )}
                {hasAltTextDef && (
                  <TextFieldInput
                    type="text"
                    label={t("alternative_text")}
                    placeholder={t("add_image_alternative_text")}
                    clearable={false}
                    // Safely access alt text, using 'as any' for now to match context
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    value={(config as any)?.setup?.alt || ""}
                    onChange={(value: string) => {
                      handleConfigChange("setup", "alt", value);
                    }}
                  />
                )}
              </>
            }
          />
        </>
      )}
    </>
  );
};

export const WidgetData = ({ sectionLabel, config, onChange }: WidgetConfigProps) => {
  const { t } = useTranslation("common");
  const schema = widgetSchemaMap[config.type];
  const { projectId } = useParams();
  const { filteredLayers } = useLayerByGeomType(["feature", "table"], undefined, projectId as string);

  const hasLayerProjectIdDef = useMemo(() => {
    return hasNestedSchemaPath(schema, "setup.layer_project_id");
  }, [schema]);

  const hasColumnNameDef = useMemo(() => {
    return hasNestedSchemaPath(schema, "setup.column_name");
  }, [schema]);

  const hasOperationDef = useMemo(() => {
    return hasNestedSchemaPath(schema, "setup.operation_type");
  }, [schema]);

  const hasGroupColumnNameDef = useMemo(() => {
    return hasNestedSchemaPath(schema, "setup.group_by_column_name");
  }, [schema]);

  const selectedLayer = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return filteredLayers.find((layer) => layer.value === (config?.setup as any)?.layer_project_id);
  }, [config?.setup, filteredLayers]);

  const selectedLayerDatasetId = useLayerDatasetId(
    selectedLayer?.value as number | undefined,
    projectId as string
  );

  const fieldType = {
    [widgetTypes.Values.histogram_chart]: "number",
  };

  const { layerFields } = useLayerFields(selectedLayerDatasetId || "", fieldType[config.type] ?? undefined);

  const selectedColumnName = useMemo(() => {
    if (!hasColumnNameDef || !selectedLayer) return undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return layerFields.find((field) => field.name === (config?.setup as any)?.column_name);
  }, [hasColumnNameDef, selectedLayer, layerFields, config?.setup]);

  return (
    <>
      <SectionHeader
        active
        alwaysActive
        label={sectionLabel ?? t("data")}
        disableAdvanceOptions
        icon={ICON_NAME.LAYERS}
      />
      <SectionOptions
        active
        baseOptions={
          <>
            {hasLayerProjectIdDef && (
              <Selector
                selectedItems={selectedLayer}
                setSelectedItems={(item: SelectorItem | undefined) => {
                  // Build updated setup, resetting dependent fields as needed
                  const updatedSetup: Record<string, any> = {
                    ...(config.setup as any),
                    layer_project_id: item?.value,
                    ...(hasColumnNameDef && { column_name: undefined }),
                    ...(hasOperationDef && { operation_type: undefined, operation_value: undefined }),
                    ...(hasGroupColumnNameDef && { group_by_column_name: undefined }),
                  };

                  onChange({
                    ...config,
                    setup: updatedSetup,
                  } as WidgetConfigSchema);
                }}
                items={filteredLayers}
                emptyMessage={t("no_layers_found")}
                emptyMessageIcon={ICON_NAME.LAYERS}
                label={t("select_layer")}
                placeholder={t("select_layer")}
              />
            )}
            {/* For widgets such as filter etc */}
            {selectedLayer && hasColumnNameDef && !hasOperationDef && (
              <LayerFieldSelector
                fields={layerFields}
                selectedField={selectedColumnName}
                disabled={!selectedLayer}
                setSelectedField={(field) => {
                  // handleConfigChange("column_name", field?.name);
                  onChange({
                    ...config,
                    setup: {
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      ...(config.setup as any),
                      column_name: field?.name,
                    },
                  } as WidgetConfigSchema);
                }}
                label={t("select_field")}
              />
            )}
            {/* For widgets that support operations (like statistics) */}
            {selectedLayer && hasOperationDef && (
              <StatisticSelector
                layerProjectId={selectedLayer.value as number}
                hasGroupBy={hasGroupColumnNameDef}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                value={{
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  method: (config.setup as any).operation_type,
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  value: (config.setup as any).operation_value,
                  groupBy: (config.setup as any).group_by_column_name,
                }}
                onChange={(value) => {
                  // Check if group_by changed - if so, reset custom_order and color_map
                  const currentGroupBy = (config.setup as any).group_by_column_name;
                  const groupByChanged = hasGroupColumnNameDef && value.groupBy !== currentGroupBy;

                  onChange({
                    ...config,
                    setup: {
                      ...(config.setup as any),
                      operation_type: value.method,
                      operation_value: value.value,
                      ...(hasGroupColumnNameDef && { group_by_column_name: value.groupBy }),
                      // Reset custom_order when group_by changes
                      ...(groupByChanged && { custom_order: undefined }),
                    },
                    // Reset color_map when group_by changes
                    ...(groupByChanged && {
                      options: {
                        ...((config as any).options || {}),
                        color_map: undefined,
                      },
                    }),
                  } as WidgetConfigSchema);
                }}
              />
            )}
          </>
        }
      />
    </>
  );
};

export const WidgetSetup = ({ config, onChange }: WidgetConfigProps) => {
  return (
    <>
      {config.type === widgetTypes.Enum.filter && <WidgetFilterLayout config={config} onChange={onChange} />}
    </>
  );
};

// Widget types that handle their own style configuration
const widgetTypesWithCustomStyle = [widgetTypes.Enum.filter];

export const WidgetOptions = ({ active = true, sectionLabel, config, onChange }: WidgetConfigProps) => {
  const { t } = useTranslation("common");
  const { projectId } = useParams();
  const schema = widgetSchemaMap[config.type];

  const hasTargetLayersDef = useMemo(() => {
    return hasNestedSchemaPath(schema, "options.target_layers");
  }, [schema]);

  const hasFilterViewPortDef = useMemo(() => {
    return hasNestedSchemaPath(schema, "options.filter_by_viewport");
  }, [schema]);

  const hasZoomToSelectionDef = useMemo(() => {
    return hasNestedSchemaPath(schema, "options.zoom_to_selection");
  }, [schema]);

  const hasNumberFormatDef = useMemo(() => {
    return hasNestedSchemaPath(schema, "options.format");
  }, [schema]);

  const hasPaddingDef = useMemo(() => {
    return hasNestedSchemaPath(schema, "options.has_padding");
  }, [schema]);

  const hasSelectionResponseDef = useMemo(() => {
    return hasNestedSchemaPath(schema, "options.selection_response");
  }, [schema]);

  // Get project layers for target layer selection
  const { layers: projectLayers } = useProjectLayers(projectId as string);

  // Selection response options for chart widgets
  const selectionResponseOptions = useMemo(
    () => [
      { value: "filter", label: t("filter") },
      { value: "highlight", label: t("highlight") },
    ],
    [t]
  );

  const selectedSelectionResponse = useMemo(() => {
    const mode = (config as any)?.options?.selection_response || "filter";
    return selectionResponseOptions.find((opt) => opt.value === mode);
  }, [config, selectionResponseOptions]);

  const handleOptionChange = useCallback(
    (key: string, value: any) => {
      const updatedOptions = {
        ...((config as any).options || {}),
        [key]: value, // Dynamically set the property based on the 'key' argument.
      };
      onChange({
        ...config,
        options: updatedOptions,
      } as WidgetConfigSchema); // Assert the type for the onChange callback.
    },
    [config, onChange]
  );

  const hasOption = useMemo(() => {
    return (
      hasTargetLayersDef ||
      hasFilterViewPortDef ||
      hasZoomToSelectionDef ||
      hasNumberFormatDef ||
      hasPaddingDef ||
      hasSelectionResponseDef
    );
  }, [
    hasTargetLayersDef,
    hasFilterViewPortDef,
    hasZoomToSelectionDef,
    hasNumberFormatDef,
    hasPaddingDef,
    hasSelectionResponseDef,
  ]);

  return (
    <>
      {hasOption && (
        <>
          <SectionHeader
            active={active}
            alwaysActive
            label={sectionLabel ?? t("options")}
            disableAdvanceOptions
            icon={ICON_NAME.SLIDERS}
          />
          <SectionOptions
            active={active}
            baseOptions={
              <Stack spacing={2}>
                {/* Selection response for chart widgets (filter vs highlight) */}
                {hasSelectionResponseDef && (config as any)?.options?.cross_filter && (
                  <Selector
                    selectedItems={selectedSelectionResponse}
                    setSelectedItems={(item: SelectorItem) => {
                      handleOptionChange("selection_response", item?.value);
                    }}
                    items={selectionResponseOptions}
                    label={t("selection_response")}
                    tooltip={t("selection_response_tooltip")}
                  />
                )}

                {/* Target layers config for multi-layer filtering */}
                {hasTargetLayersDef &&
                  (config.setup as any)?.layer_project_id &&
                  (config.setup as any)?.column_name && (
                    <TargetLayersConfig
                      layerProjectId={(config.setup as any)?.layer_project_id}
                      targetLayers={(config as any)?.options?.target_layers}
                      projectLayers={projectLayers || []}
                      onTargetLayersChange={(targets) => {
                        handleOptionChange("target_layers", targets?.length ? targets : undefined);
                      }}
                    />
                  )}

                {hasFilterViewPortDef && (
                  <FormControlLabel
                    control={
                      <Checkbox
                        size="small"
                        color="primary"
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        checked={!!(config as any)?.options?.filter_by_viewport}
                        onChange={(e) => {
                          handleOptionChange("filter_by_viewport", e.target.checked);
                        }}
                      />
                    }
                    label={<Typography variant="body2">{t("filter_viewport")}</Typography>}
                  />
                )}

                {hasZoomToSelectionDef && (
                  <FormControlLabel
                    control={
                      <Checkbox
                        size="small"
                        color="primary"
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        checked={!!(config as any)?.options?.zoom_to_selection}
                        onChange={(e) => {
                          handleOptionChange("zoom_to_selection", e.target.checked);
                        }}
                      />
                    }
                    label={<Typography variant="body2">{t("zoom_to_selection")}</Typography>}
                  />
                )}

                {hasNumberFormatDef && (
                  <Stack sx={{ mt: 2 }}>
                    <NumberFormatSelector
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      numberFormat={(config as any)?.options?.format}
                      onNumberFormatChange={(format) => handleOptionChange("format", format)}
                    />
                  </Stack>
                )}
                {hasPaddingDef && (
                  <FormControlLabel
                    control={
                      <Checkbox
                        size="small"
                        color="primary"
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        checked={!!(config as any)?.options?.has_padding}
                        onChange={(e) => {
                          handleOptionChange("has_padding", e.target.checked);
                        }}
                      />
                    }
                    label={<Typography variant="body2">{t("padding")}</Typography>}
                  />
                )}
              </Stack>
            }
          />
        </>
      )}
    </>
  );
};

export const WidgetStyle = ({ active = true, sectionLabel, config, onChange }: WidgetConfigProps) => {
  const { t } = useTranslation("common");
  const { projectId } = useParams();
  const schema = widgetSchemaMap[config.type];

  // Check if this widget handles its own style configuration
  const hasCustomStyleHandling = widgetTypesWithCustomStyle.includes(config.type as any);

  const hasColorDef = useMemo(() => {
    return hasNestedSchemaPath(schema, "options.color");
  }, [schema]);

  const hasHighlightColorDef = useMemo(() => {
    return hasNestedSchemaPath(schema, "options.highlight_color");
  }, [schema]);

  const hasSelectedColorDef = useMemo(() => {
    return hasNestedSchemaPath(schema, "options.selected_color");
  }, [schema]);

  const hasColorMapDef = useMemo(() => {
    return hasNestedSchemaPath(schema, "options.color_map");
  }, [schema]);

  const hasColorRangeDef = useMemo(() => {
    return hasNestedSchemaPath(schema, "options.color_range");
  }, [schema]);

  const hasCustomOrderDef = useMemo(() => {
    return hasNestedSchemaPath(schema, "setup.custom_order");
  }, [schema]);

  const hasContextLabelDef = useMemo(() => {
    return hasNestedSchemaPath(schema, "options.context_label");
  }, [schema]);

  // Check if we're in highlight mode (for showing selected color option)
  const isHighlightMode = (config as any)?.options?.selection_response === "highlight";

  // Get layer dataset ID for color/order config
  const selectedLayerForStyle = useMemo(() => {
    return (config?.setup as any)?.layer_project_id;
  }, [config?.setup]);

  const selectedLayerDatasetIdForStyle = useLayerDatasetId(
    selectedLayerForStyle as number | undefined,
    projectId as string
  );

  // Get the group_by_column_name for category styling
  const groupByColumnNameForStyle = useMemo(() => {
    return (config?.setup as any)?.group_by_column_name;
  }, [config?.setup]);

  // Get layer fields for context label field selection
  const { layerFields: contextLabelFields } = useLayerFields(selectedLayerDatasetIdForStyle || "");

  // Extract options for dependency tracking (text widgets don't have options)
  const configOptions = (config as any)?.options;

  const contextLabel = useMemo(() => {
    return configOptions?.context_label;
  }, [configOptions]);

  const selectedContextField = useMemo(() => {
    if (!contextLabel?.field) return undefined;
    return contextLabelFields.find((f) => f.name === contextLabel.field);
  }, [contextLabel?.field, contextLabelFields]);

  const handleOptionChange = useCallback(
    (key: string, value: any) => {
      const updatedOptions = {
        ...((config as any).options || {}),
        [key]: value,
      };
      onChange({
        ...config,
        options: updatedOptions,
      } as WidgetConfigSchema);
    },
    [config, onChange]
  );

  const handleSetupChange = useCallback(
    (key: string, value: any) => {
      onChange({
        ...config,
        setup: {
          ...((config as any).setup || {}),
          [key]: value,
        },
      } as WidgetConfigSchema);
    },
    [config, onChange]
  );

  const hasStyle = useMemo(() => {
    // Skip for widgets that handle their own style configuration
    if (hasCustomStyleHandling) return false;
    return (
      hasColorDef ||
      hasHighlightColorDef ||
      hasSelectedColorDef ||
      hasColorMapDef ||
      hasColorRangeDef ||
      hasCustomOrderDef ||
      hasContextLabelDef
    );
  }, [
    hasColorDef,
    hasHighlightColorDef,
    hasSelectedColorDef,
    hasColorMapDef,
    hasColorRangeDef,
    hasCustomOrderDef,
    hasContextLabelDef,
    hasCustomStyleHandling,
  ]);

  return (
    <>
      {hasStyle && (
        <>
          <SectionHeader
            active={active}
            alwaysActive
            label={sectionLabel ?? t("style")}
            disableAdvanceOptions
            icon={ICON_NAME.STYLE}
          />
          <SectionOptions
            active={active}
            baseOptions={
              <Stack spacing={2}>
                {/* Base color for charts */}
                {hasColorDef && (
                  <WidgetColorPicker
                    label={t("base_color")}
                    color={(config as any)?.options?.color || "#0e58ff"}
                    onChange={(color) => handleOptionChange("color", color)}
                  />
                )}

                {/* Hover color - always visible when defined */}
                {hasHighlightColorDef && (
                  <WidgetColorPicker
                    label={t("highlight_color")}
                    color={(config as any)?.options?.highlight_color || "#3b82f6"}
                    onChange={(color) => handleOptionChange("highlight_color", color)}
                  />
                )}

                {/* Selection color - only shown when selection_response is "highlight" */}
                {hasSelectedColorDef && isHighlightMode && (
                  <WidgetColorPicker
                    label={t("selected_color")}
                    color={(config as any)?.options?.selected_color || "#f5b704"}
                    onChange={(color) => handleOptionChange("selected_color", color)}
                  />
                )}

                {/* Category order + colors for charts (integrated like layer styling ordinal) */}
                {hasColorMapDef &&
                  hasCustomOrderDef &&
                  selectedLayerDatasetIdForStyle &&
                  groupByColumnNameForStyle && (
                    <CategoryColorConfig
                      layerId={selectedLayerDatasetIdForStyle}
                      fieldName={groupByColumnNameForStyle}
                      customOrder={(config as any)?.setup?.custom_order}
                      colorMap={(config as any)?.options?.color_map}
                      colorRange={(config as any)?.options?.color_range}
                      colorPalette={(config as any)?.options?.color_range?.colors}
                      onChange={(order, colorMap) => {
                        // Update both setup.custom_order and options.color_map atomically
                        onChange({
                          ...config,
                          setup: {
                            ...((config as any).setup || {}),
                            custom_order: order.length ? order : undefined,
                          },
                          options: {
                            ...((config as any).options || {}),
                            color_map: colorMap.length ? colorMap : undefined,
                          },
                        } as WidgetConfigSchema);
                      }}
                      onPaletteChange={(colorRange, order, colorMap) => {
                        // Update color_range, custom_order, and color_map atomically
                        onChange({
                          ...config,
                          setup: {
                            ...((config as any).setup || {}),
                            custom_order: order.length ? order : undefined,
                          },
                          options: {
                            ...((config as any).options || {}),
                            color_range: colorRange,
                            color_map: colorMap.length ? colorMap : undefined,
                          },
                        } as WidgetConfigSchema);
                      }}
                    />
                  )}

                {/* Category order only (no color picking) - for widgets with custom_order but no color_map */}
                {hasCustomOrderDef &&
                  !hasColorMapDef &&
                  selectedLayerDatasetIdForStyle &&
                  groupByColumnNameForStyle && (
                    <CategoryOrderConfig
                      layerId={selectedLayerDatasetIdForStyle}
                      fieldName={groupByColumnNameForStyle}
                      customOrder={(config as any)?.setup?.custom_order}
                      onOrderChange={(order) => {
                        handleSetupChange("custom_order", order.length ? order : undefined);
                      }}
                    />
                  )}

                {/* Context label for pie charts - shows dynamic label based on filtered data */}
                {hasContextLabelDef && selectedLayerDatasetIdForStyle && (
                  <>
                    <LayerFieldSelector
                      fields={contextLabelFields}
                      selectedField={selectedContextField}
                      setSelectedField={(field) => {
                        handleOptionChange(
                          "context_label",
                          field?.name
                            ? { field: field.name, default_value: contextLabel?.default_value }
                            : undefined
                        );
                      }}
                      label={t("context_field")}
                      tooltip={t("context_field_tooltip")}
                    />
                    {contextLabel?.field && (
                      <TextFieldInput
                        type="text"
                        label={t("default_label")}
                        placeholder={t("default_label_placeholder")}
                        clearable
                        value={contextLabel?.default_value || ""}
                        onChange={(value: string) => {
                          handleOptionChange("context_label", {
                            field: contextLabel.field,
                            default_value: value || undefined,
                          });
                        }}
                        tooltip={t("default_label_tooltip")}
                      />
                    )}
                  </>
                )}
              </Stack>
            }
          />
        </>
      )}
    </>
  );
};
