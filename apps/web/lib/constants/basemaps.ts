import { MAPTILER_KEY } from "@/lib/constants";

export interface Basemap {
  value: string;
  url: string;
  title: string;
  subtitle: string;
  thumbnail: string;
}

export const BASEMAPS: Basemap[] = [
  {
    value: "streets",
    url: `https://api.maptiler.com/maps/streets-v2/style.json?key=${MAPTILER_KEY}`,
    title: "High Fidelity",
    subtitle: "Great for public presentations",
    thumbnail: `https://cloud.maptiler.com/static/img/maps/streets-v2.png`,
  },
  {
    value: "satellite",
    url: `https://api.maptiler.com/maps/hybrid/style.json?key=${MAPTILER_KEY}`,
    title: "Satellite",
    subtitle: "As seen from space",
    thumbnail: "https://cloud.maptiler.com/static/img/maps/satellite.png",
  },
  {
    value: "light",
    url: `https://api.maptiler.com/maps/dataviz-light/style.json?key=${MAPTILER_KEY}`,
    title: "Light",
    subtitle: "For highlighting data overlays",
    thumbnail: "https://media.maptiler.com/old/img/cloud/slider/streets-v2-light.png",
  },
  {
    value: "dark",
    url: `https://api.maptiler.com/maps/dataviz-dark/style.json?key=${MAPTILER_KEY}`,
    title: "Dark",
    subtitle: "For highlighting data overlays",
    thumbnail: "https://media.maptiler.com/old/img/cloud/slider/streets-v2-dark.png",
  },
  {
    value: "basemap_de_col",
    url: `https://sgx.geodatenzentrum.de/gdz_basemapde_vektor/styles/bm_web_col.json`,
    title: "BKG Basemap",
    subtitle: "Colored",
    thumbnail: "https://basemap.de/viewer/assets/basemap_colour.png",
  },
  {
    value: "basemap_de_gry",
    url: `https://sgx.geodatenzentrum.de/gdz_basemapde_vektor/styles/bm_web_gry.json`,
    title: "BKG Basemap",
    subtitle: "Grayscale",
    thumbnail: "https://basemap.de/viewer/assets/basemap_greyscale.png",
  },
  {
    value: "basemap_de_top",
    url: `https://sgx.geodatenzentrum.de/gdz_basemapde_vektor/styles/bm_web_top.json`,
    title: "BKG Basemap",
    subtitle: "Topographic",
    thumbnail: "https://basemap.de/viewer/assets/basemap_hillshade.png",
  },
];

// Default basemap value
export const DEFAULT_BASEMAP = "light";

/**
 * Get basemap URL from basemap value
 */
export function getBasemapUrl(basemap: string | null | undefined): string {
  const key = basemap || DEFAULT_BASEMAP;
  const found = BASEMAPS.find((b) => b.value === key);
  return found?.url || BASEMAPS.find((b) => b.value === DEFAULT_BASEMAP)!.url;
}
