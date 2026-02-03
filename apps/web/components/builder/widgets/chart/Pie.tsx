import { Box, Typography } from "@mui/material";
import chroma from "chroma-js";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Cell, Label, Pie, PieChart, ResponsiveContainer } from "recharts";

import { useLayerUniqueValues } from "@/lib/api/layers";
import { useProjectLayerAggregationStats } from "@/lib/api/projects";
import { formatNumber } from "@/lib/utils/format-number";
import { normalizeValue } from "@/lib/utils/normalize-value";
import type { AggregationStatsQueryParams } from "@/lib/validations/project";
import { aggregationStatsQueryParams } from "@/lib/validations/project";
import type { PieChartSchema } from "@/lib/validations/widget";
import { pieChartConfigSchema } from "@/lib/validations/widget";

import { useChartWidget } from "@/hooks/map/DashboardBuilderHooks";

import { StaleDataLoader } from "@/components/builder/widgets/common/StaleDataLoader";
import { WidgetStatusContainer } from "@/components/builder/widgets/common/WidgetStatusContainer";

const FALLBACK_COLORS = ["#5A1846", "#900C3F", "#C70039", "#E3611C", "#F1920E", "#FFC300"];
const OPACITY_MODIFIER = "33";

export const PieChartWidget = ({ config: rawConfig }: { config: PieChartSchema }) => {
  const { t, i18n } = useTranslation("common");
  const { config, queryParams, layerId } = useChartWidget(
    rawConfig,
    pieChartConfigSchema,
    aggregationStatsQueryParams
  );

  const { aggregationStats, isLoading, isError } = useProjectLayerAggregationStats(
    layerId,
    queryParams as AggregationStatsQueryParams
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

  const originalData = useMemo(() => aggregationStats?.items || [], [aggregationStats]);

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

  const data = orderedData;
  const displayData = useMemo(() => {
    return data.length > 0 ? data : [{ grouped_value: t("no_data"), operation_value: 1 }];
  }, [data, t]);

  const [activeIndex, setActiveIndex] = useState(0);
  const [isHovering, setIsHovering] = useState(false);

  const totalOperationValue = useMemo(
    () => displayData.reduce((sum, item) => sum + item.operation_value, 0),
    [displayData]
  );

  const selectedValues = useMemo(() => [] as string[], []); // TODO: Connect to filters

  const calculateDefaultActiveIndex = useCallback(() => {
    if (data.length === 0) return 0;

    // If custom_order is defined, use the first item in the order as default
    const customOrder = config?.setup?.custom_order;
    if (customOrder && customOrder.length > 0) {
      // The data is already sorted by custom_order, so first item (index 0) is the default
      return 0;
    }

    // Fallback: show the item with max value
    const candidates = data.filter((item) =>
      selectedValues.length > 0 ? selectedValues.includes(item.grouped_value) : true
    );

    const validData = candidates.length > 0 ? candidates : data;
    const maxValue = Math.max(...validData.map((item) => item.operation_value));
    return data.findIndex((item) => item.operation_value === maxValue);
  }, [data, selectedValues, config?.setup?.custom_order]);

  // Build color lookup from color_map if available (normalized for format differences)
  const colorMapLookup = useMemo(() => {
    const lookup = new Map<string, string>();
    config?.options?.color_map?.forEach(([value, color]) => {
      lookup.set(normalizeValue(value), color);
    });
    return lookup;
  }, [config?.options?.color_map]);

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
    const palette = data.length > 0 ? config?.options?.color_range?.colors || FALLBACK_COLORS : ["#e0e0e0"];

    return displayData.length === 1
      ? [palette[0]]
      : chroma.scale(palette).mode("lch").colors(displayData.length);
  }, [displayData, data.length, config?.options?.color_range?.colors, colorMapLookup]);

  const computedColors = useMemo(() => {
    return displayData.map((item, index) => {
      const baseColor = baseColors[index % baseColors.length];
      const isSelected = selectedValues.includes(item.grouped_value);

      if (data.length === 0) return baseColor; // Keep full color for "No data" state

      return isHovering || selectedValues.length > 0
        ? isSelected
          ? baseColor
          : `${baseColor}${OPACITY_MODIFIER}`
        : baseColor;
    });
  }, [displayData, baseColors, selectedValues, data.length, isHovering]);

  useEffect(() => {
    const newIndex = calculateDefaultActiveIndex();
    setActiveIndex(Math.max(newIndex, 0));
  }, [calculateDefaultActiveIndex]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handlePieEnter = (_: any, index: number) => {
    setActiveIndex(index);
  };

  const handleChartHover = (isEnter: boolean) => {
    setIsHovering(isEnter);
    if (!isEnter) {
      const newIndex = calculateDefaultActiveIndex();
      setActiveIndex(Math.max(newIndex, 0));
    }
  };

  const isChartConfigured = useMemo(() => {
    return config?.setup?.layer_project_id && queryParams;
  }, [config, queryParams]);

  return (
    <>
      <WidgetStatusContainer
        isLoading={isLoading && !aggregationStats && !isError}
        isNotConfigured={!isChartConfigured}
        isError={isError}
        height={150}
        isNotConfiguredMessage={t("please_configure_chart")}
        errorMessage={t("cannot_render_chart_error")}
      />

      {config && !isError && aggregationStats && isChartConfigured && (
        <Box sx={{ position: "relative", width: "100%" }}>
          {contextLabelValue && (
            <Typography
              variant="caption"
              sx={{
                position: "absolute",
                top: 4,
                left: 0,
                right: 0,
                textAlign: "center",
                fontWeight: 600,
                color: "text.secondary",
                zIndex: 1,
              }}>
              {contextLabelValue}
            </Typography>
          )}
          <ResponsiveContainer width="100%" aspect={1.2}>
            <PieChart
              onMouseEnter={() => handleChartHover(true)}
              onMouseLeave={() => handleChartHover(false)}>
              <Pie
                activeIndex={activeIndex}
                activeShape={{
                  fill: baseColors[activeIndex % baseColors.length],
                  strokeWidth: 0,
                }}
                data={displayData}
                dataKey="operation_value"
                nameKey="grouped_value"
                cx="50%"
                cy="50%"
                innerRadius="65%"
                cursor="pointer"
                isAnimationActive={false}
                paddingAngle={data.length > 0 ? 5 : 0}
                onMouseEnter={handlePieEnter}>
                {displayData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={computedColors[index]} stroke="none" />
                ))}

                <Label
                  value={`${formatNumber(
                    displayData[activeIndex].operation_value / totalOperationValue,
                    "percent_1d",
                    i18n.language
                  )}`}
                  position="centerBottom"
                  fontSize={14}
                  fontWeight="bold"
                  fill={baseColors[activeIndex % baseColors.length]}
                />

                <Label
                  value={displayData[activeIndex].grouped_value}
                  position="centerTop"
                  fontSize={12}
                  dy={8}
                  fontWeight="bold"
                  fill={baseColors[activeIndex % baseColors.length]}
                />
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </Box>
      )}
      <StaleDataLoader isLoading={isLoading} hasData={!!aggregationStats} />
    </>
  );
};
