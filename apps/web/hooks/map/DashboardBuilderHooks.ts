/* eslint-disable @typescript-eslint/no-explicit-any */
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useMap } from "react-map-gl/maplibre";
import type { ZodSchema } from "zod";

import { useProjectLayers } from "@/lib/api/projects";
import { selectProjectLayers } from "@/lib/store/layer/selectors";
import { getMapExtentCQL } from "@/lib/utils/map/navigate";

import { useAppSelector } from "@/hooks/store/ContextHooks";

interface UseLayerFiltersParams {
  layerId?: number;
}

/**
 * Returns a combined CQL filter from temporary filters in the store,
 * merging per-layer filters and additional target filters for the specified layer.
 */
function useTemporaryFilters({ layerId }: UseLayerFiltersParams) {
  const { temporaryFilters } = useAppSelector((state) => state.map);

  return useMemo(() => {
    if (!layerId) return undefined;

    // Primary filters for this layer
    const primaryFilters = temporaryFilters.filter((f) => f.layer_id === layerId).map((f) => f.filter);

    // Additional target filters from multi-layer attribute filtering
    const additionalTargetFilters = temporaryFilters
      .flatMap((f) => f.additional_targets || [])
      .filter((t) => t.layer_id === layerId)
      .map((t) => t.filter);

    const filters = [...primaryFilters, ...additionalTargetFilters];
    if (!filters.length) return undefined;

    return { op: "and", args: filters };
  }, [temporaryFilters, layerId]);
}

interface ChartWidgetResult<TConfig, TQueryParams> {
  config?: TConfig;
  queryParams?: TQueryParams;
  baseQueryParams?: TQueryParams; // Query params without cross_filter (for highlight mode)
  projectId: string;
  layerId?: string; // The layer UUID for API calls
  layerProjectId?: number; // The layer_project_id from config
  hasActiveFilters?: boolean; // Whether there are cross-filters currently applied
}

/**
 * Hook to parse config, build and update query params for chart widgets.
 * Applies temporary filters only if options.cross_filter is true.
 * Returns layerId (UUID) for use with GeoAPI analytics endpoints.
 */
export function useChartWidget<TConfig, TQueryParams>(
  rawConfig: unknown,
  configSchema: ZodSchema<TConfig>,
  querySchema: ZodSchema<TQueryParams>
): ChartWidgetResult<TConfig, TQueryParams> {
  const { map } = useMap();
  const { projectId } = useParams() as { projectId: string };

  // Try Redux store first (populated in public view)
  const reduxLayers = useAppSelector(selectProjectLayers);
  // Fall back to API hook (used in builder/authenticated view)
  const { layers: apiLayers } = useProjectLayers(projectId);
  // Use Redux layers if available, otherwise fall back to API layers
  const layers = reduxLayers && reduxLayers.length > 0 ? reduxLayers : apiLayers;

  const config = useMemo(() => {
    const result = configSchema.safeParse(rawConfig);
    return result.success ? result.data : undefined;
  }, [rawConfig, configSchema]);

  // Get the layer_id (UUID) from layer_project_id
  const layerId = useMemo(() => {
    const layerProjectId = (config as any)?.setup?.layer_project_id;
    if (!layerProjectId || !layers) return undefined;
    const layer = layers.find((l) => l.id === layerProjectId);
    return layer?.layer_id;
  }, [config, layers]);

  // Get temporary filters for this layer
  const tempFilters = useTemporaryFilters({ layerId: (config as any)?.setup?.layer_project_id });
  const hasActiveFilters = !!tempFilters;

  // Build query with cross_filter applied (for filtered view)
  const buildQuery = useCallback(
    (applyCrossFilter: boolean): any | undefined => {
      if (!config) return;

      const base = { ...(config as any).setup, ...(config as any).options };
      const parsed = querySchema.safeParse(base);
      if (!parsed.success) return;

      // Apply cross filters only when enabled and requested
      let cqlQuery;
      if (applyCrossFilter && (config as any).options?.cross_filter && tempFilters) {
        cqlQuery = JSON.parse(JSON.stringify(tempFilters));
      }

      if ((config as any).options?.filter_by_viewport && map) {
        const extentRaw = getMapExtentCQL(map);
        if (extentRaw) {
          const extent = JSON.parse(extentRaw);
          if (cqlQuery && cqlQuery.args) {
            cqlQuery.args.push(extent);
          } else {
            cqlQuery = extent;
          }
        }
      }

      return cqlQuery ? { ...parsed.data, query: JSON.stringify(cqlQuery) } : (parsed.data as TQueryParams);
    },
    [config, map, querySchema, tempFilters]
  );

  const [queryParams, setQueryParams] = useState<TQueryParams | undefined>(() => buildQuery(true));
  const [baseQueryParams, setBaseQueryParams] = useState<TQueryParams | undefined>(() => buildQuery(false));

  // Update on config, filters, or map load
  useEffect(() => {
    setQueryParams(buildQuery(true));
    setBaseQueryParams(buildQuery(false));
  }, [buildQuery]);

  // Update viewport filter on map moves
  useEffect(() => {
    if (!map || !(config as any)?.options?.filter_by_viewport) return;

    const onMoveEnd = () => {
      setQueryParams(buildQuery(true));
      setBaseQueryParams(buildQuery(false));
    };

    map.on("moveend", onMoveEnd);
    return () => {
      map.off("moveend", onMoveEnd);
    };
  }, [map, config, buildQuery]);

  const layerProjectId = (config as any)?.setup?.layer_project_id as number | undefined;

  return { config, queryParams, baseQueryParams, projectId, layerId, layerProjectId, hasActiveFilters };
}
