import { Box, Typography, useTheme } from "@mui/material";
import LinearProgress from "@mui/material/LinearProgress";
import chroma from "chroma-js";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { useLayerUniqueValues } from "@/lib/api/layers";
import { useProjectLayerAggregationStats } from "@/lib/api/projects";
import { formatNumber } from "@/lib/utils/format-number";
import { normalizeValue } from "@/lib/utils/normalize-value";
import type { AggregationStatsQueryParams } from "@/lib/validations/project";
import { aggregationStatsQueryParams } from "@/lib/validations/project";
import type { CategoriesChartSchema } from "@/lib/validations/widget";
import { categoriesChartConfigSchema } from "@/lib/validations/widget";

import { useChartWidget } from "@/hooks/map/DashboardBuilderHooks";

import { StaleDataLoader } from "@/components/builder/widgets/common/StaleDataLoader";
import { WidgetStatusContainer } from "@/components/builder/widgets/common/WidgetStatusContainer";

const FALLBACK_COLORS = ["#5A1846", "#900C3F", "#C70039", "#E3611C", "#F1920E", "#FFC300"];
const DEFAULT_SELECTED_COLOR = "#f5b704";
const OPACITY_MODIFIER = "33";

export const CategoriesChartWidget = ({ config: rawConfig }: { config: CategoriesChartSchema }) => {
  const { t, i18n } = useTranslation("common");
  const theme = useTheme();
  const { config, queryParams, baseQueryParams, layerId } = useChartWidget(
    rawConfig,
    categoriesChartConfigSchema,
    aggregationStatsQueryParams
  );

  // Determine if we're in highlight mode
  const isHighlightMode = config?.options?.selection_response === "highlight";

  // In highlight mode: always fetch full data for main display
  // In filter mode: use filtered data
  const mainQueryParams = isHighlightMode ? baseQueryParams : queryParams;

  const { aggregationStats, isLoading, isError } = useProjectLayerAggregationStats(
    layerId,
    mainQueryParams as AggregationStatsQueryParams
  );

  // Context label: fetch unique values for the configured field
  const contextLabelConfig = config?.options?.context_label;
  const contextLabelQueryParams = useMemo(() => {
    if (!contextLabelConfig?.field) return undefined;
    return {
      size: 1, // Only fetch 1 item - we use 'total' to check if there's exactly 1 unique value
      page: 1,
      order: "descendent" as const,
      ...(queryParams?.query ? { query: queryParams.query } : {}),
    };
  }, [contextLabelConfig?.field, queryParams?.query]);

  const { data: contextLabelData } = useLayerUniqueValues(
    contextLabelConfig?.field ? layerId || "" : "",
    contextLabelConfig?.field || "",
    contextLabelQueryParams
  );

  // Determine the context label value
  const contextLabelValue = useMemo(() => {
    if (!contextLabelConfig) return null;
    if (!contextLabelData) return null;

    // Use total count to determine if there's exactly 1 unique value
    if (contextLabelData.total === 1 && contextLabelData.items?.length === 1) {
      // Single unique value - show it
      return String(contextLabelData.items[0].value);
    }
    // Multiple values - show default (or null if not set)
    return contextLabelConfig.default_value || null;
  }, [contextLabelConfig, contextLabelData]);

  // Fetch selected/filtered data (only in highlight mode)
  const { aggregationStats: selectedStats, isLoading: isSelectedLoading } = useProjectLayerAggregationStats(
    isHighlightMode ? layerId : undefined,
    queryParams as AggregationStatsQueryParams
  );

  // Data handling
  const originalData = useMemo(() => aggregationStats?.items || [], [aggregationStats]);

  // Only show highlight visualization when there's actually filtered data
  const showHighlight = useMemo(() => {
    if (!isHighlightMode || !selectedStats || !aggregationStats) return false;
    // Calculate total counts to check if there's any filtering
    const totalMain = originalData.reduce((sum, item) => sum + item.operation_value, 0);
    const totalSelected = (selectedStats.items || []).reduce((sum, item) => sum + item.operation_value, 0);
    return totalSelected < totalMain;
  }, [isHighlightMode, selectedStats, aggregationStats, originalData]);

  // Create a map of selected counts by category
  const selectedCountMap = useMemo(() => {
    if (!showHighlight || !selectedStats?.items) return new Map<string, number>();
    return new Map(selectedStats.items.map((item) => [item.grouped_value, item.operation_value]));
  }, [showHighlight, selectedStats]);

  // Apply custom order if defined
  const orderedData = useMemo(() => {
    if (!originalData.length) return originalData;

    const customOrder = config?.setup?.custom_order;
    if (!customOrder || customOrder.length === 0) {
      return originalData;
    }

    // Sort by custom order - items in customOrder come first in that order,
    // items not in customOrder are excluded
    // Use normalized comparison to handle format differences (e.g., "12" vs "12.0")
    const orderMap = new Map(customOrder.map((val, idx) => [normalizeValue(val), idx]));
    return originalData
      .filter((item) => orderMap.has(normalizeValue(item.grouped_value)))
      .sort((a, b) => {
        const aIdx = orderMap.get(normalizeValue(a.grouped_value)) ?? Infinity;
        const bIdx = orderMap.get(normalizeValue(b.grouped_value)) ?? Infinity;
        return aIdx - bIdx;
      });
  }, [originalData, config?.setup?.custom_order]);

  const displayData = useMemo(() => {
    if (orderedData.length > 0) return orderedData;
    return [{ grouped_value: t("no_data"), operation_value: 0 }];
  }, [orderedData, t]);

  // Calculate max value for progress scaling
  const maxValue = useMemo(() => {
    return orderedData.length > 0 ? Math.max(...orderedData.map((item) => item.operation_value)) : 1; // For "No data" state
  }, [orderedData]);

  const [activeCategory, setActiveCategory] = useState<string | undefined>();
  const [isHovering, setIsHovering] = useState(false);

  // Build color lookup from color_map if available (normalized for format differences)
  const colorMapLookup = useMemo(() => {
    const lookup = new Map<string, string>();
    config?.options?.color_map?.forEach(([value, color]) => {
      lookup.set(normalizeValue(value), color);
    });
    return lookup;
  }, [config?.options?.color_map]);

  // Generate base colors for each category
  const baseColors = useMemo(() => {
    if (displayData.length === 0) return [];

    // If we have a color_map, use it for colors
    if (colorMapLookup.size > 0) {
      return displayData.map((item, index) => {
        const mappedColor = colorMapLookup.get(normalizeValue(item.grouped_value));
        if (mappedColor) return mappedColor;
        // Fallback for items not in color_map
        const palette = config?.options?.color_range?.colors || FALLBACK_COLORS;
        const colors = chroma.scale(palette).mode("lch").colors(displayData.length);
        return colors[index];
      });
    }

    // Default behavior: generate from color_range
    const palette =
      orderedData.length > 0 ? config?.options?.color_range?.colors || FALLBACK_COLORS : ["#e0e0e0"];

    return displayData.length === 1
      ? [palette[0]]
      : chroma.scale(palette).mode("lch").colors(displayData.length);
  }, [displayData, orderedData.length, config?.options?.color_range?.colors, colorMapLookup]);

  // Colors for highlight/selected states
  const selectedColor = config?.options?.selected_color || DEFAULT_SELECTED_COLOR;

  const getColor = (category: (typeof displayData)[number], index: number, isSelected: boolean) => {
    const isActive = activeCategory === category.grouped_value;
    const hasData = orderedData.length > 0;
    const baseColor = baseColors[index % baseColors.length];

    if (!hasData) return "#e0e0e0";

    // In highlight mode with selections shown
    if (showHighlight && isSelected) {
      if (isActive) {
        // Lighten the base color for hover effect
        return chroma(selectedColor).brighten(0.5).hex();
      }
      return selectedColor;
    }

    if (isActive) {
      // Lighten the base color for hover effect
      return chroma(baseColor).brighten(0.5).hex();
    }
    if (isHovering && !isActive) return `${baseColor}${OPACITY_MODIFIER}`;
    return baseColor;
  };

  const isChartConfigured = useMemo(() => {
    return config?.setup?.layer_project_id && queryParams;
  }, [config, queryParams]);

  return (
    <>
      <WidgetStatusContainer
        isLoading={(isLoading || isSelectedLoading) && !aggregationStats && !isError}
        isNotConfigured={!isChartConfigured}
        isError={isError}
        height={150}
        isNotConfiguredMessage={t("please_configure_chart")}
        errorMessage={t("cannot_render_chart_error")}
      />

      {config && !isError && isChartConfigured && (
        <Box
          onMouseEnter={() => setIsHovering(true)}
          onMouseLeave={() => {
            setIsHovering(false);
            setActiveCategory(undefined);
          }}
          sx={{
            width: "100%",
            display: "flex",
            flexDirection: "column",
            p: 2,
          }}>
          {contextLabelValue && (
            <Typography
              variant="caption"
              sx={{
                textAlign: "center",
                fontWeight: 600,
                color: "text.secondary",
                mb: 1,
              }}>
              {contextLabelValue}
            </Typography>
          )}
          {displayData.map((category, index) => {
            const totalValue = category.operation_value;
            const selectedValue = showHighlight ? selectedCountMap.get(category.grouped_value) || 0 : 0;
            const percentage = (totalValue / maxValue) * 100;
            const selectedPercentage = showHighlight ? (selectedValue / maxValue) * 100 : 0;
            const displayValue = formatNumber(
              category.operation_value,
              config.options?.format,
              i18n.language
            );

            return (
              <Box
                key={category.grouped_value}
                onMouseEnter={() => setActiveCategory(category.grouped_value)}
                sx={{
                  width: "100%",
                  cursor: "pointer",
                  py: 1,
                  opacity:
                    originalData.length > 0 && activeCategory && activeCategory !== category.grouped_value
                      ? 0.5
                      : 1,
                  transition: "opacity 0.2s ease",
                }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
                  <Typography variant="caption" fontWeight={500}>
                    {category.grouped_value}
                  </Typography>
                  <Typography variant="caption" fontWeight={500}>
                    {showHighlight && selectedValue > 0 ? `${selectedValue} / ${displayValue}` : displayValue}
                  </Typography>
                </Box>
                {showHighlight ? (
                  // Stacked progress bar for highlight mode
                  <Box sx={{ position: "relative", height: 8 }}>
                    {/* Base bar (full width for total) */}
                    <LinearProgress
                      variant="determinate"
                      value={percentage}
                      sx={{
                        position: "absolute",
                        width: "100%",
                        height: 8,
                        borderRadius: 4,
                        backgroundColor: theme.palette.grey[200],
                        "& .MuiLinearProgress-bar": {
                          borderRadius: 4,
                          backgroundColor: getColor(category, index, false),
                        },
                      }}
                    />
                    {/* Selected bar (overlay showing selected portion) */}
                    {selectedValue > 0 && (
                      <LinearProgress
                        variant="determinate"
                        value={selectedPercentage}
                        sx={{
                          position: "absolute",
                          width: "100%",
                          height: 8,
                          borderRadius: 4,
                          backgroundColor: "transparent",
                          "& .MuiLinearProgress-bar": {
                            borderRadius: 4,
                            backgroundColor: getColor(category, index, true),
                          },
                        }}
                      />
                    )}
                  </Box>
                ) : (
                  // Normal single progress bar
                  <LinearProgress
                    variant="determinate"
                    value={percentage}
                    sx={{
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: theme.palette.grey[200],
                      "& .MuiLinearProgress-bar": {
                        borderRadius: 4,
                        backgroundColor: getColor(category, index, false),
                      },
                    }}
                  />
                )}
              </Box>
            );
          })}
        </Box>
      )}
      <StaleDataLoader isLoading={isLoading || isSelectedLoading} hasData={!!orderedData.length} />
    </>
  );
};
