"use client";

import { Box, Stack, Typography } from "@mui/material";
import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";

import type { TypographyStyle } from "@/lib/constants/typography";
import { DEFAULT_FONT_FAMILY } from "@/lib/constants/typography";
import { rgbToHex } from "@/lib/utils/helpers";
import type { RGBColor } from "@/types/map/color";
import type { ProjectLayer } from "@/lib/validations/project";
import type { ReportElement } from "@/lib/validations/reportLayout";

import { LayerIcon } from "@/components/map/panels/layer/legend/LayerIcon";
import { LayerLegendPanel } from "@/components/map/panels/layer/legend/LayerLegend";

/**
 * Convert TypographyStyle to MUI sx props
 */
function typographyToSx(style?: TypographyStyle): Record<string, unknown> {
  if (!style) return { fontFamily: DEFAULT_FONT_FAMILY };
  const sx: Record<string, unknown> = {};
  sx.fontFamily = style.fontFamily || DEFAULT_FONT_FAMILY;
  if (style.fontSize) sx.fontSize = style.fontSize;
  if (style.fontColor) sx.color = style.fontColor;
  if (style.fontWeight) sx.fontWeight = style.fontWeight;
  return sx;
}

/**
 * Legend typography configuration (per text role)
 */
interface LegendTypographyConfig {
  title?: TypographyStyle;
  layerName?: TypographyStyle;
  legendItem?: TypographyStyle;
  caption?: TypographyStyle;
}

/**
 * Legend element configuration interface
 */
export interface LegendElementConfig {
  /** Title configuration */
  title?: {
    text?: string;
  };
  /** Map element ID to bind to (null = show all layers) */
  mapElementId?: string | null;
  /** Layout options */
  layout?: {
    columns?: number;
    showLayerNames?: boolean;
  };
  /** Typography settings for different text roles */
  typography?: LegendTypographyConfig;
}

interface LegendElementRendererProps {
  element: ReportElement;
  projectLayers?: ProjectLayer[];
  mapElements?: ReportElement[];
  viewOnly?: boolean;
  /** Zoom level to scale content */
  zoom?: number;
}

/**
 * Legend Element Renderer for print reports
 *
 * Displays layer legends in a configurable multi-column layout.
 * Uses the same legend logic as ProjectLayerTree for consistent rendering.
 */
const LegendElementRenderer: React.FC<LegendElementRendererProps> = ({
  element,
  projectLayers = [],
  mapElements = [],
  viewOnly: _viewOnly = true,
  zoom = 1,
}) => {
  const { t } = useTranslation("common");
  // Extract legend config
  const config = element.config as LegendElementConfig;
  const titleText = config?.title?.text ?? t("legend");
  const layoutConfig = config?.layout ?? { columns: 1, showLayerNames: true };
  const typography = config?.typography;

  // Filter layers based on map element binding
  const filteredLayers = useMemo(() => {
    // If bound to a specific map element, filter layers
    if (config?.mapElementId && mapElements.length > 0) {
      const mapElement = mapElements.find((m) => m.id === config.mapElementId);
      if (mapElement?.map_config?.layers) {
        const mapLayerIds = mapElement.map_config.layers;
        return projectLayers.filter((l) => mapLayerIds.includes(l.id));
      }
    }

    // Show all visible layers
    return projectLayers.filter((layer) => {
      const props = layer.properties as Record<string, unknown>;
      // Only show layers that are visible and have legend enabled
      const isVisible = props.visibility !== false;
      const legendShow = (props.legend as { show?: boolean })?.show !== false;
      return isVisible && legendShow;
    });
  }, [projectLayers, mapElements, config?.mapElementId]);

  // Limit columns to number of layers (no empty columns)
  const columns = Math.min(layoutConfig.columns || 1, filteredLayers.length || 1);

  return (
    <Box
      sx={{
        width: `${100 / zoom}%`,
        height: `${100 / zoom}%`,
        overflow: "hidden",
        p: 1,
        boxSizing: "border-box",
        transform: `scale(${zoom})`,
        transformOrigin: "top left",
      }}>
      {/* Title - only show if text is not empty */}
      {titleText && (
        <Typography
          variant="subtitle2"
          sx={{
            fontWeight: "bold",
            mb: 1,
            ...typographyToSx(typography?.title),
          }}>
          {titleText}
        </Typography>
      )}

      {/* Legend content */}
      {filteredLayers.length === 0 ? (
        <Typography variant="caption" color="text.secondary">
          No layers to display
        </Typography>
      ) : (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: `repeat(${columns}, 1fr)`,
            gap: 1,
            overflow: "hidden",
          }}>
          {filteredLayers.map((layer) => (
            <LayerLegendItem
              key={layer.id}
              layer={layer}
              showLayerName={layoutConfig.showLayerNames !== false}
              typography={typography}
            />
          ))}
        </Box>
      )}
    </Box>
  );
};

/**
 * Individual layer legend item.
 * Mirrors the logic from ProjectLayerTree for deciding between
 * simple icon vs expanded LayerLegendPanel.
 */
interface LayerLegendItemProps {
  layer: ProjectLayer;
  showLayerName?: boolean;
  typography?: LegendTypographyConfig;
}

const LayerLegendItem: React.FC<LayerLegendItemProps> = ({ layer, showLayerName = true, typography }) => {
  const props = layer.properties as Record<string, unknown>;
  const geomType = layer.type === "feature"
    ? (layer.feature_layer_geometry_type || "polygon")
    : layer.type === "raster"
      ? "raster"
      : "polygon";

  // Same check as ProjectLayerTree line 756
  const hasComplexLegend = !!(props.color_field || props.stroke_color_field || props.marker_field);

  // Raster legend check
  const rasterStyle = props.style as { style_type?: string; categories?: unknown[]; color_map?: unknown[] } | undefined;
  const hasRasterLegend =
    layer.type === "raster" &&
    rasterStyle &&
    ((rasterStyle.style_type === "categories" && Array.isArray(rasterStyle.categories) && rasterStyle.categories.length > 0) ||
      (rasterStyle.style_type === "color_range" && Array.isArray(rasterStyle.color_map) && rasterStyle.color_map.length > 0));

  // Simple icon props (same logic as ProjectLayerTree lines 813-842)
  const baseColor: string = props.color
    ? Array.isArray(props.color) && (props.color as number[]).length >= 3
      ? rgbToHex(props.color as RGBColor)
      : Array.isArray(props.color)
        ? `rgb(${(props.color as number[]).join(",")})`
        : String(props.color)
    : "#ccc";
  const strokeColor: string | undefined = props.stroke_color
    ? Array.isArray(props.stroke_color) && (props.stroke_color as number[]).length >= 3
      ? rgbToHex(props.stroke_color as RGBColor)
      : Array.isArray(props.stroke_color)
        ? `rgb(${(props.stroke_color as number[]).join(",")})`
        : String(props.stroke_color)
    : undefined;

  return (
    <Box sx={{ minWidth: 0 }}>
      {/* Layer name with simple icon for non-complex legends */}
      {showLayerName && (
        <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 0.5 }}>
          {!hasComplexLegend && !hasRasterLegend && (
            <Box sx={{ flexShrink: 0 }}>
              <LayerIcon
                type={geomType}
                color={baseColor}
                strokeColor={strokeColor}
                filled={props.filled !== false}
                iconUrl={
                  !props.marker_field && props.custom_marker && (props.marker as Record<string, unknown>)?.url
                    ? ((props.marker as Record<string, unknown>).url as string)
                    : undefined
                }
                iconSource={
                  !props.marker_field && props.custom_marker && (props.marker as Record<string, unknown>)?.source
                    ? ((props.marker as Record<string, unknown>).source as "custom" | "library")
                    : "library"
                }
              />
            </Box>
          )}
          <Typography
            variant="caption"
            sx={{
              fontWeight: 500,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              ...typographyToSx(typography?.layerName),
            }}>
            {layer.name}
          </Typography>
        </Stack>
      )}

      {/* Legend caption */}
      {!!(props.legend && (props.legend as Record<string, unknown>).caption) && (
        <Typography
          variant="caption"
          fontWeight="bold"
          sx={{ display: "block", mb: 0.5, ...typographyToSx(typography?.caption) }}>
          {String((props.legend as Record<string, unknown>).caption)}
        </Typography>
      )}

      {/* Complex feature legend - attribute-based styling */}
      {hasComplexLegend && layer.type === "feature" && (
        <LayerLegendPanel
          properties={props}
          geometryType={geomType}
          itemTypographySx={typographyToSx(typography?.legendItem)}
        />
      )}

      {/* Raster legend */}
      {hasRasterLegend && (
        <LayerLegendPanel
          properties={props}
          geometryType="raster"
          itemTypographySx={typographyToSx(typography?.legendItem)}
        />
      )}

      {/* Raster legend URLs */}
      {layer.type === "raster" &&
        layer.other_properties?.legend_urls &&
        (layer.other_properties.legend_urls as string[]).map((url: string) => (
          <Stack key={url} spacing={1} sx={{ mt: 0.5 }} direction="column">
            <img src={url} alt="" style={{ width: "100%" }} />
          </Stack>
        ))}
    </Box>
  );
};

export default LegendElementRenderer;
