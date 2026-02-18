"use client";

import { cogProtocol } from "@geomatico/maplibre-cog-protocol";
import { Box } from "@mui/material";
import maplibregl from "maplibre-gl";
import { useParams, useSearchParams } from "next/navigation";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Map, MapProvider, type MapRef } from "react-map-gl/maplibre";

import { DEFAULT_BASEMAP, getBasemapUrl } from "@/lib/constants/basemaps";
import { PATTERN_IMAGES } from "@/lib/constants/pattern-images";
import { addOrUpdateMarkerImages, addPatternImages } from "@/lib/transformers/map-image";
import type { FeatureLayerPointProperties } from "@/lib/validations/layer";
import type { ProjectLayer } from "@/lib/validations/project";

import Layers from "@/components/map/Layers";

maplibregl.addProtocol("cog", cogProtocol);

// Thumbnail dimensions
const THUMBNAIL_WIDTH = 800;
const THUMBNAIL_HEIGHT = 450;

// Default view state
const DEFAULT_VIEW_STATE = {
  latitude: 48.13,
  longitude: 11.57,
  zoom: 10,
  bearing: 0,
  pitch: 0,
};

/**
 * Interface for thumbnail data passed via URL params
 * This is serialized as base64-encoded JSON in the `data` query param
 */
interface ThumbnailData {
  viewState: {
    latitude: number;
    longitude: number;
    zoom: number;
    bearing?: number;
    pitch?: number;
  };
  basemap: string;
  layers: ProjectLayer[];
  bounds?: [number, number, number, number]; // [west, south, east, north]
  useBounds?: boolean; // If true, fit to bounds; if false, use viewState (default: true if bounds provided)
}

/**
 * Parse and decode thumbnail data from URL query param
 */
function parseThumbnailData(dataParam: string | null): ThumbnailData | null {
  if (!dataParam) return null;

  try {
    const decoded = atob(dataParam);
    const parsed = JSON.parse(decoded) as ThumbnailData;

    // Validate required fields
    if (!parsed.viewState || !parsed.basemap || !Array.isArray(parsed.layers)) {
      console.error("Invalid thumbnail data: missing required fields");
      return null;
    }

    return parsed;
  } catch (error) {
    console.error("Failed to parse thumbnail data:", error);
    return null;
  }
}

/**
 * Thumbnail page that renders a simple map view for Playwright screenshot capture.
 * This page is designed to be rendered without any UI chrome - just the map.
 *
 * URL pattern: /thumbnail/[type]/[id]?data=<base64-encoded-json>
 * - type: "project" or "layer"
 * - id: UUID of the project or layer
 * - data: Base64-encoded JSON containing viewState, basemap, layers, and optional bounds
 *
 * The data param contains all necessary information to render the map,
 * avoiding the need for authenticated API calls.
 *
 * Playwright will navigate to this page and take a screenshot for thumbnail generation.
 */
export default function ThumbnailPage() {
  const params = useParams();
  const searchParams = useSearchParams();

  const type = params.type as "project" | "layer";
  const id = params.id as string;
  const dataParam = searchParams.get("data");

  const [mounted, setMounted] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const mapRef = React.useRef<MapRef>(null);

  // Ensure client-side only rendering to avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  // Parse thumbnail data from URL param
  const thumbnailData = useMemo(() => {
    return parseThumbnailData(dataParam);
  }, [dataParam]);

  // Extract data from thumbnailData or use defaults
  const viewState = useMemo(() => {
    if (thumbnailData?.viewState) {
      return {
        latitude: thumbnailData.viewState.latitude ?? DEFAULT_VIEW_STATE.latitude,
        longitude: thumbnailData.viewState.longitude ?? DEFAULT_VIEW_STATE.longitude,
        zoom: thumbnailData.viewState.zoom ?? DEFAULT_VIEW_STATE.zoom,
        bearing: thumbnailData.viewState.bearing ?? DEFAULT_VIEW_STATE.bearing,
        pitch: thumbnailData.viewState.pitch ?? DEFAULT_VIEW_STATE.pitch,
      };
    }
    return DEFAULT_VIEW_STATE;
  }, [thumbnailData]);

  const layersToRender = useMemo((): ProjectLayer[] => {
    return thumbnailData?.layers ?? [];
  }, [thumbnailData]);

  const bounds = useMemo(() => {
    return thumbnailData?.bounds ?? null;
  }, [thumbnailData]);

  // Whether to use fitBounds or initial viewState
  // Default: use bounds if provided, unless explicitly set to false
  const useBounds = useMemo(() => {
    if (thumbnailData?.useBounds !== undefined) {
      return thumbnailData.useBounds;
    }
    // Default to using bounds if they are provided
    return bounds !== null;
  }, [thumbnailData, bounds]);

  const basemapUrl = useMemo(() => {
    if (thumbnailData?.basemap) {
      return getBasemapUrl(thumbnailData.basemap);
    }
    return getBasemapUrl(DEFAULT_BASEMAP);
  }, [thumbnailData]);

  // Handle map load
  const handleMapLoad = useCallback(() => {
    setMapLoaded(true);

    if (mapRef.current) {
      // Add marker images for point layers with custom markers
      layersToRender.forEach((layer) => {
        if (layer.type === "feature" && layer.feature_layer_geometry_type === "point") {
          const pointFeatureProperties = layer.properties as FeatureLayerPointProperties;
          addOrUpdateMarkerImages(layer.id, pointFeatureProperties, mapRef.current);
        }
      });

      // Add pattern images for fill layers
      addPatternImages(PATTERN_IMAGES ?? [], mapRef.current);

      // Fit bounds if provided and useBounds is true
      // This ensures the thumbnail shows all content within the bounds
      if (bounds && useBounds) {
        const [west, south, east, north] = bounds;

        // Calculate appropriate padding based on thumbnail type
        // For single layers, use moderate padding for visual balance
        // For projects with multiple layers, use slightly more padding for context
        const isLayer = type === "layer";
        const padding = isLayer ? 30 : 40;

        mapRef.current?.fitBounds(
          [
            [west, south],
            [east, north],
          ],
          {
            padding,
            duration: 0,
            // Allow higher zoom for single layers to show detail
            maxZoom: isLayer ? 18 : 16,
          }
        );
      }
    }
  }, [bounds, useBounds, layersToRender, type]);

  // Signal to Playwright that the page is ready
  useEffect(() => {
    // Data is ready if we have valid thumbnailData
    const isDataLoaded = thumbnailData !== null;

    if (isDataLoaded && mapLoaded) {
      // Give additional delay for map tiles to fully render
      const timer = setTimeout(() => {
        setIsReady(true);
        // Add a data attribute that Playwright can check
        document.body.setAttribute("data-thumbnail-ready", "true");
      }, 1500); // 1.5 second delay to allow map tiles to render
      return () => clearTimeout(timer);
    }
  }, [thumbnailData, mapLoaded]);

  // Show empty placeholder during SSR/initial mount to avoid hydration mismatch
  if (!mounted) {
    return (
      <Box
        sx={{
          width: THUMBNAIL_WIDTH,
          height: THUMBNAIL_HEIGHT,
          backgroundColor: "#fff",
        }}
      />
    );
  }

  // Error state - no data provided or invalid data
  if (!thumbnailData) {
    return (
      <Box
        sx={{
          width: THUMBNAIL_WIDTH,
          height: THUMBNAIL_HEIGHT,
          backgroundColor: "#fff",
        }}
      />
    );
  }

  return (
    <Box
      id="thumbnail-container"
      sx={{
        width: THUMBNAIL_WIDTH,
        height: THUMBNAIL_HEIGHT,
        backgroundColor: "#fff",
        padding: 0,
        margin: 0,
        overflow: "hidden",
      }}>
      <MapProvider>
        <Map
          ref={mapRef}
          mapStyle={basemapUrl}
          initialViewState={viewState}
          style={{ width: THUMBNAIL_WIDTH, height: THUMBNAIL_HEIGHT }}
          attributionControl={false}
          logoPosition="bottom-left"
          preserveDrawingBuffer // Required for screenshot
          onLoad={handleMapLoad}
          interactive={false} // Disable interactivity for thumbnails
        >
          {mapLoaded && layersToRender.length > 0 && <Layers layers={layersToRender} />}
        </Map>
      </MapProvider>

      {/* Hidden metadata for Playwright */}
      <div
        id="thumbnail-metadata"
        data-ready={isReady}
        data-type={type}
        data-id={id}
        data-layer-count={layersToRender.length}
        style={{ display: "none" }}
      />
    </Box>
  );
}
