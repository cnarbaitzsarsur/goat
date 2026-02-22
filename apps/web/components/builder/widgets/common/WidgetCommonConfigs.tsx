/* eslint-disable @typescript-eslint/no-explicit-any */
import { Autocomplete, Checkbox, Chip, FormControlLabel, Paper, Stack, TextField, Typography, useTheme } from "@mui/material";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { ICON_NAME } from "@p4b/ui/components/Icon";

import { DEFAULT_COLOR_RANGE } from "@/lib/constants/color";
import { useLayerUniqueValues } from "@/lib/api/layers";
import { useProjectLayers } from "@/lib/api/projects";
import { formatNumber } from "@/lib/utils/format-number";
import { hasNestedSchemaPath } from "@/lib/utils/zod";
import type { FormatNumberTypes, WidgetConfigSchema } from "@/lib/validations/widget";
import {
  formatNumberTypes,
  pieLayoutTypes,
  widgetSchemaMap,
  widgetTypes,
} from "@/lib/validations/widget";

import type { SelectorItem } from "@/types/map/common";

import useLayerFields from "@/hooks/map/CommonHooks";
import { useLayerByGeomType, useLayerDatasetId } from "@/hooks/map/ToolsHooks";

import WidgetColorPicker from "@/components/builder/widgets/common/WidgetColorPicker";
import CategoryColorConfig from "@/components/builder/widgets/data/CategoryColorConfig";
import CategoryOrderConfig from "@/components/builder/widgets/data/CategoryOrderConfig";
import FormLabelHelper from "@/components/common/FormLabelHelper";
import { ArrowPopper } from "@/components/ArrowPoper";
import { TargetLayersConfig, WidgetFilterLayout } from "@/components/builder/widgets/data/DataConfig";
import LayerFieldSelector from "@/components/map/common/LayerFieldSelector";
import { StatisticSelector } from "@/components/map/common/StatisticSelector";
import SectionHeader from "@/components/map/panels/common/SectionHeader";
import SectionOptions from "@/components/map/panels/common/SectionOptions";
import Selector from "@/components/map/panels/common/Selector";
import TextFieldInput from "@/components/map/panels/common/TextFieldInput";
import ColorPalette from "@/components/map/panels/style/color/ColorPalette";
import ColorRangeSelector from "@/components/map/panels/style/color/ColorRangeSelector";

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
  const theme = useTheme();
  const { projectId } = useParams();
  const schema = widgetSchemaMap[config.type];
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [isClickAwayEnabled, setIsClickAwayEnabled] = useState(true);
  const latestConfigRef = useRef(config);

  useEffect(() => {
    latestConfigRef.current = config;
  }, [config]);

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

  const hasPieLayoutDef = useMemo(() => {
    return hasNestedSchemaPath(schema, "options.layout") && config.type === widgetTypes.Enum.pie_chart;
  }, [schema, config.type]);

  const hasDisplayFieldLabelDef = useMemo(() => {
    return hasNestedSchemaPath(schema, "options.display_field_label");
  }, [schema]);

  const hasHistogramNumBinsDef = useMemo(() => {
    return hasNestedSchemaPath(schema, "options.num_bins");
  }, [schema]);

  const hasHistogramXAxisTicksDef = useMemo(() => {
    return hasNestedSchemaPath(schema, "options.x_axis_ticks");
  }, [schema]);

  // Check if we're in highlight mode (for showing selected color option)
  const isHighlightMode = (config as any)?.options?.selection_response === "highlight";
  const isCategoriesChart = config.type === widgetTypes.Enum.categories_chart;
  const isHistogramChart = config.type === widgetTypes.Enum.histogram_chart;

  // Categories chart supports simple single-color and value-based styling
  const supportsAttributeStylingToggle = isCategoriesChart && hasColorDef && hasColorRangeDef;
  const isAttributeStylingEnabled = (config as any)?.options?.attribute_based_styling !== false;
  const showSimpleColorPicker = hasColorDef && (!supportsAttributeStylingToggle || !isAttributeStylingEnabled);
  const valueColorScale = (config as any)?.options?.value_color_scale || "quantile";
  const styleAttributeSource = (config as any)?.options?.style_attribute_source || "statistics";
  const pieLayout = (config as any)?.options?.layout || pieLayoutTypes.Values.center_active;

  const valueColorScaleOptions = useMemo(
    () => [
      { value: "quantile", label: t("quantile") },
      { value: "equal_interval", label: t("equal_interval") },
      { value: "standard_deviation", label: t("standard_deviation") },
      { value: "heads_and_tails", label: t("heads_and_tails") },
    ],
    [t]
  );

  const selectedValueColorScale = useMemo(() => {
    return valueColorScaleOptions.find((opt) => opt.value === valueColorScale);
  }, [valueColorScaleOptions, valueColorScale]);

  const styleAttributeSourceOptions = useMemo(() => {
    const options: SelectorItem[] = [];
    const operationValueFieldName = (config?.setup as any)?.operation_value;
    const groupByFieldName = (config?.setup as any)?.group_by_column_name;
    if (operationValueFieldName || (config as any)?.setup?.operation_type === "count") {
      options.push({ value: "statistics", label: t("statistics_field") });
    }
    if (groupByFieldName) {
      options.push({ value: "group_by", label: t("group_by_field") });
    }
    return options;
  }, [config, t]);

  const selectedStyleAttributeSource = useMemo(() => {
    return styleAttributeSourceOptions.find((option) => option.value === styleAttributeSource);
  }, [styleAttributeSourceOptions, styleAttributeSource]);

  const pieLayoutOptions = useMemo(
    () => [
      { value: pieLayoutTypes.Values.center_active, label: t("pie_layout_center_active") },
      { value: pieLayoutTypes.Values.all_labels_outside, label: t("pie_layout_all_labels_outside") },
      { value: pieLayoutTypes.Values.legend, label: t("pie_layout_legend") },
    ],
    [t]
  );

  const selectedPieLayout = useMemo(() => {
    return pieLayoutOptions.find((option) => option.value === pieLayout);
  }, [pieLayoutOptions, pieLayout]);

  const histogramXAxisTickValues = useMemo(() => {
    const values = (config as any)?.options?.x_axis_ticks;
    if (!Array.isArray(values)) return [] as string[];
    return values
      .map((value: unknown) => Number(value))
      .filter((value: number) => Number.isFinite(value))
      .sort((a: number, b: number) => a - b)
      .map((value: number) => String(value));
  }, [config]);

  const [histogramXAxisTickInput, setHistogramXAxisTickInput] = useState("");

  const normalizedHighlightColor = useMemo(() => {
    const currentColor = (config as any)?.options?.highlight_color;
    if (!currentColor) return "#f5b704";
    if (String(currentColor).toLowerCase() === "#3b82f6") return "#f5b704";
    return currentColor;
  }, [config]);

  const usesStatisticsStyleSource = styleAttributeSource === "statistics";
  const usesGroupByStyleSource = styleAttributeSource === "group_by";

  const selectedColorRange = ((config as any)?.options?.color_range || DEFAULT_COLOR_RANGE) as any;

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

  const styleValueCountQueryParams = useMemo(
    () => ({
      size: 100,
      page: 1,
      order: "descendent" as const,
    }),
    []
  );

  const { data: styleValueCountData } = useLayerUniqueValues(
    selectedLayerDatasetIdForStyle || "",
    groupByColumnNameForStyle || "",
    selectedLayerDatasetIdForStyle && groupByColumnNameForStyle ? styleValueCountQueryParams : undefined
  );

  const maxStatisticsColorSteps = useMemo(() => {
    if (!isCategoriesChart || !usesStatisticsStyleSource) {
      return undefined;
    }

    const groupedValueCount = styleValueCountData?.items?.length;
    if (!groupedValueCount || groupedValueCount < 1) {
      return undefined;
    }

    return groupedValueCount;
  }, [isCategoriesChart, usesStatisticsStyleSource, styleValueCountData?.items?.length]);

  // Get layer fields for context label field selection
  const { layerFields: contextLabelFields } = useLayerFields(selectedLayerDatasetIdForStyle || "");

  // Extract options for dependency tracking (text widgets don't have options)
  const configOptions = (config as any)?.options;

  const contextLabel = useMemo(() => {
    return configOptions?.context_label;
  }, [configOptions]);

  const statisticValueFieldName = useMemo(() => {
    return (config?.setup as any)?.operation_value;
  }, [config?.setup]);

  const selectedContextField = useMemo(() => {
    const selectedFieldName = contextLabel?.field || statisticValueFieldName;
    if (!selectedFieldName) return undefined;
    return contextLabelFields.find((f) => f.name === selectedFieldName);
  }, [contextLabel?.field, contextLabelFields, statisticValueFieldName]);

  const handleOptionChange = useCallback(
    (key: string, value: any) => {
      const latestConfig = latestConfigRef.current as any;
      const updatedOptions = {
        ...(latestConfig.options || {}),
        [key]: value,
      };
      onChange({
        ...latestConfig,
        options: updatedOptions,
      } as WidgetConfigSchema);
    },
    [onChange]
  );

  const commitHistogramXAxisTicks = useCallback(
    (values: string[]) => {
      const parsed = values
        .flatMap((value) => String(value).split(/[;,\s]+/))
        .map((value) => Number(value.trim()))
        .filter((value) => Number.isFinite(value));

      handleOptionChange(
        "x_axis_ticks",
        parsed.length ? Array.from(new Set(parsed)).sort((a, b) => a - b) : undefined
      );
      setHistogramXAxisTickInput("");
    },
    [handleOptionChange]
  );

  const handleSetupChange = useCallback(
    (key: string, value: any) => {
      const latestConfig = latestConfigRef.current as any;
      onChange({
        ...latestConfig,
        setup: {
          ...(latestConfig.setup || {}),
          [key]: value,
        },
      } as WidgetConfigSchema);
    },
    [onChange]
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
      hasContextLabelDef ||
      hasPieLayoutDef ||
      hasDisplayFieldLabelDef ||
      hasHistogramNumBinsDef ||
      hasHistogramXAxisTicksDef
    );
  }, [
    hasColorDef,
    hasHighlightColorDef,
    hasSelectedColorDef,
    hasColorMapDef,
    hasColorRangeDef,
    hasCustomOrderDef,
    hasContextLabelDef,
    hasPieLayoutDef,
    hasDisplayFieldLabelDef,
    hasHistogramNumBinsDef,
    hasHistogramXAxisTicksDef,
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
                {showSimpleColorPicker && (
                  <WidgetColorPicker
                    label={t("base_color")}
                    color={(config as any)?.options?.color || "#0e58ff"}
                    onChange={(color) => handleOptionChange("color", color)}
                  />
                )}

                {/* Toggle between simple and value-based styling */}
                {supportsAttributeStylingToggle && (
                  <FormControlLabel
                    control={
                      <Checkbox
                        size="small"
                        color="primary"
                        checked={isAttributeStylingEnabled}
                        onChange={(e) => {
                          handleOptionChange("attribute_based_styling", e.target.checked);
                        }}
                      />
                    }
                    label={<Typography variant="body2">{t("value_based_styling")}</Typography>}
                  />
                )}

                {supportsAttributeStylingToggle && isAttributeStylingEnabled && (
                  <Selector
                    selectedItems={selectedStyleAttributeSource}
                    setSelectedItems={(item: SelectorItem) => {
                      const nextStyleSource = item?.value || "statistics";

                      if (
                        nextStyleSource === "group_by" &&
                        Array.isArray((config as any)?.setup?.custom_order) &&
                        (config as any).setup.custom_order.length === 0
                      ) {
                        onChange({
                          ...config,
                          setup: {
                            ...((config as any).setup || {}),
                            custom_order: undefined,
                          },
                          options: {
                            ...((config as any).options || {}),
                            style_attribute_source: nextStyleSource,
                          },
                        } as WidgetConfigSchema);
                        return;
                      }

                      handleOptionChange("style_attribute_source", nextStyleSource);
                    }}
                    items={styleAttributeSourceOptions}
                    label={t("styling_field")}
                  />
                )}

                {supportsAttributeStylingToggle && isAttributeStylingEnabled && usesStatisticsStyleSource && (
                  <Selector
                    selectedItems={selectedValueColorScale}
                    setSelectedItems={(item: SelectorItem) => handleOptionChange("value_color_scale", item?.value)}
                    items={valueColorScaleOptions}
                    label={t("color_scale")}
                  />
                )}

                {supportsAttributeStylingToggle &&
                  isAttributeStylingEnabled &&
                  usesStatisticsStyleSource &&
                  hasColorRangeDef &&
                  !isCategoriesChart && (
                  <ArrowPopper
                    open={paletteOpen}
                    placement="bottom"
                    arrow={false}
                    isClickAwayEnabled={isClickAwayEnabled}
                    onClose={() => setPaletteOpen(false)}
                    content={
                      <Paper
                        sx={{
                          py: 3,
                          boxShadow: "rgba(0, 0, 0, 0.16) 0px 6px 12px 0px",
                          width: "235px",
                          maxHeight: "500px",
                        }}>
                        <ColorRangeSelector
                          scaleType={valueColorScale}
                          maxSteps={maxStatisticsColorSteps}
                          selectedColorRange={selectedColorRange}
                          onSelectColorRange={(colorRange) => {
                            handleOptionChange("color_range", colorRange);
                            setPaletteOpen(false);
                          }}
                          setIsBusy={(busy) => setIsClickAwayEnabled(!busy)}
                          setIsOpen={setPaletteOpen}
                        />
                      </Paper>
                    }>
                    <Stack spacing={1}>
                      <Typography variant="body2" color={paletteOpen ? "primary.main" : "text.primary"}>
                        {t("palette")}
                      </Typography>
                      <Stack
                        onClick={() => setPaletteOpen(!paletteOpen)}
                        direction="row"
                        alignItems="center"
                        sx={{
                          borderRadius: theme.spacing(1.2),
                          border: "1px solid",
                          outline: "2px solid transparent",
                          minHeight: "40px",
                          borderColor: theme.palette.mode === "dark" ? "#464B59" : "#CBCBD1",
                          ...(paletteOpen && {
                            outline: `2px solid ${theme.palette.primary.main}`,
                          }),
                          cursor: "pointer",
                          p: 2,
                          "&:hover": {
                            ...(!paletteOpen && {
                              borderColor: theme.palette.mode === "dark" ? "#5B5F6E" : "#B8B7BF",
                            }),
                          },
                        }}>
                        <ColorPalette colors={selectedColorRange?.colors || []} />
                      </Stack>
                    </Stack>
                  </ArrowPopper>
                )}

                {/* Hover color - always visible when defined */}
                {hasHighlightColorDef && (
                  <WidgetColorPicker
                    label={t("highlight_color")}
                    color={normalizedHighlightColor}
                    onChange={(color) => handleOptionChange("highlight_color", color)}
                  />
                )}

                {hasPieLayoutDef && (
                  <Selector
                    selectedItems={selectedPieLayout}
                    setSelectedItems={(item: SelectorItem) => {
                      handleOptionChange("layout", item?.value);
                    }}
                    items={pieLayoutOptions}
                    label={t("layout")}
                  />
                )}

                {hasDisplayFieldLabelDef && (
                  <TextFieldInput
                    type="text"
                    label={t("field_display_name")}
                    placeholder={t("field_display_name_placeholder")}
                    clearable
                    value={(config as any)?.options?.display_field_label || ""}
                    onChange={(value: string) => {
                      handleOptionChange("display_field_label", value || undefined);
                    }}
                  />
                )}

                {isHistogramChart && hasHistogramNumBinsDef && (
                  <TextFieldInput
                    type="number"
                    label={t("number_of_bins")}
                    clearable={false}
                    value={String((config as any)?.options?.num_bins || 10)}
                    onChange={(value: string) => {
                      const parsed = Number.parseInt(value, 10);
                      const sanitized = Number.isFinite(parsed)
                        ? Math.min(20, Math.max(1, parsed))
                        : 10;
                      handleOptionChange("num_bins", sanitized);
                    }}
                  />
                )}

                {isHistogramChart && hasHistogramXAxisTicksDef && (
                  <Stack spacing={0.5}>
                    <FormLabelHelper
                      label={t("x_axis_tick_values")}
                      tooltip={t("x_axis_tick_values_help")}
                      color="inherit"
                    />
                    <Autocomplete
                      multiple
                      freeSolo
                      size="small"
                      options={[]}
                      value={histogramXAxisTickValues}
                      inputValue={histogramXAxisTickInput}
                      filterSelectedOptions
                      onInputChange={(_, value) => {
                        setHistogramXAxisTickInput(value);
                      }}
                      onChange={(_, values) => {
                        commitHistogramXAxisTicks(values as string[]);
                      }}
                      renderTags={(value, getTagProps) =>
                        value.map((option, index) => {
                          const { key, ...tagProps } = getTagProps({ index });
                          return <Chip key={key} label={option} size="small" {...tagProps} />;
                        })
                      }
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          size="small"
                          placeholder={t("x_axis_tick_values_placeholder")}
                          onKeyDown={(event) => {
                            if (
                              (event.key === "Enter" || event.key === ",") &&
                              histogramXAxisTickInput.trim()
                            ) {
                              event.preventDefault();
                              commitHistogramXAxisTicks([
                                ...histogramXAxisTickValues,
                                histogramXAxisTickInput,
                              ]);
                            }
                          }}
                          onBlur={() => {
                            const pendingInput = histogramXAxisTickInput.trim();
                            if (!pendingInput) return;

                            commitHistogramXAxisTicks([
                              ...histogramXAxisTickValues,
                              pendingInput,
                            ]);
                          }}
                        />
                      )}
                    />
                  </Stack>
                )}

                {/* Selection color - only shown when selection_response is "highlight" */}
                {hasSelectedColorDef && isHighlightMode && (
                  <WidgetColorPicker
                    label={t("selected_color")}
                    color={(config as any)?.options?.selected_color || "#9333EA"}
                    onChange={(color) => handleOptionChange("selected_color", color)}
                  />
                )}

                {/* Category order + colors for charts (integrated like layer styling ordinal) */}
                {hasColorMapDef &&
                  hasCustomOrderDef &&
                  isAttributeStylingEnabled &&
                  (!isCategoriesChart || usesGroupByStyleSource || usesStatisticsStyleSource) &&
                  selectedLayerDatasetIdForStyle &&
                  groupByColumnNameForStyle && (
                    <CategoryColorConfig
                      layerId={selectedLayerDatasetIdForStyle}
                      fieldName={groupByColumnNameForStyle}
                      customOrder={(config as any)?.setup?.custom_order}
                      colorMap={(config as any)?.options?.color_map}
                      labelMap={(config as any)?.options?.label_map}
                      colorRange={(config as any)?.options?.color_range}
                      colorPalette={(config as any)?.options?.color_range?.colors}
                      onChange={(order, colorMap, labelMap) => {
                        // Update setup.custom_order + options.color_map + options.label_map atomically
                        onChange({
                          ...config,
                          setup: {
                            ...((config as any).setup || {}),
                            custom_order: order,
                          },
                          options: {
                            ...((config as any).options || {}),
                            color_map: colorMap,
                            label_map: labelMap,
                          },
                        } as WidgetConfigSchema);
                      }}
                      onPaletteChange={(colorRange, order, colorMap, labelMap) => {
                        // Update color_range, custom_order, color_map and label_map atomically
                        onChange({
                          ...config,
                          setup: {
                            ...((config as any).setup || {}),
                            custom_order: order,
                          },
                          options: {
                            ...((config as any).options || {}),
                            color_range: colorRange,
                            color_map: colorMap,
                            label_map: labelMap,
                          },
                        } as WidgetConfigSchema);
                      }}
                    />
                  )}

                {/* Category order only (no color picking) - for widgets with custom_order but no color_map */}
                {hasCustomOrderDef &&
                  !hasColorMapDef &&
                  isAttributeStylingEnabled &&
                  (!isCategoriesChart || usesGroupByStyleSource) &&
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

                {/* Context label configuration (disabled for pie charts) */}
                {hasContextLabelDef &&
                  selectedLayerDatasetIdForStyle &&
                  !isCategoriesChart &&
                  config.type !== widgetTypes.Enum.pie_chart && (
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
