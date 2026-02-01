import { Box, Typography, useTheme } from "@mui/material";
import LinearProgress from "@mui/material/LinearProgress";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { useProjectLayerAggregationStats } from "@/lib/api/projects";
import { formatNumber } from "@/lib/utils/format-number";
import type { AggregationStatsQueryParams } from "@/lib/validations/project";
import { aggregationStatsQueryParams } from "@/lib/validations/project";
import type { CategoriesChartSchema } from "@/lib/validations/widget";
import { categoriesChartConfigSchema } from "@/lib/validations/widget";

import { useChartWidget } from "@/hooks/map/DashboardBuilderHooks";

import { StaleDataLoader } from "@/components/builder/widgets/common/StaleDataLoader";
import { WidgetStatusContainer } from "@/components/builder/widgets/common/WidgetStatusContainer";

const DEFAULT_COLOR = "#0e58ff";
const DEFAULT_HOVER_COLOR = "#3b82f6";
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
    const orderMap = new Map(customOrder.map((val, idx) => [val, idx]));
    return originalData
      .filter((item) => orderMap.has(item.grouped_value))
      .sort((a, b) => {
        const aIdx = orderMap.get(a.grouped_value) ?? Infinity;
        const bIdx = orderMap.get(b.grouped_value) ?? Infinity;
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

  // Colors
  const baseColor = config?.options?.color || DEFAULT_COLOR;
  const hoverColor = config?.options?.highlight_color || DEFAULT_HOVER_COLOR;
  const selectedColor = config?.options?.selected_color || DEFAULT_SELECTED_COLOR;

  const getColor = (category: (typeof displayData)[number], isSelected: boolean) => {
    const isActive = activeCategory === category.grouped_value;
    const hasData = orderedData.length > 0;

    if (!hasData) return "#e0e0e0";

    // In highlight mode with selections shown
    if (showHighlight && isSelected) {
      if (isActive) return hoverColor;
      return selectedColor;
    }

    if (isActive) return hoverColor;
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
          {displayData.map((category) => {
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
                          backgroundColor: getColor(category, false),
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
                            backgroundColor: getColor(category, true),
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
                        backgroundColor: getColor(category, false),
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
