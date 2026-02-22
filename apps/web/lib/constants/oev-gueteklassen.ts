import type { PostOevGueteKlassen } from "@/lib/validations/tools";

export type OevConfigPresetKey = "compact_60" | "standard_120" | "extended_210";

type StationConfig = PostOevGueteKlassen["station_config"];

const OEV_STATION_GROUPS_DEFAULT: StationConfig["groups"] = {
  "0": "B",
  "1": "A",
  "2": "A",
  "3": "C",
  "6": "C",
  "7": "B",
  "100": "A",
  "101": "A",
  "102": "A",
  "103": "A",
  "104": "A",
  "105": "A",
  "106": "A",
  "107": "A",
  "108": "A",
  "109": "A",
  "110": "A",
  "111": "A",
  "112": "A",
  "114": "A",
  "116": "A",
  "117": "A",
  "200": "C",
  "201": "C",
  "202": "C",
  "204": "C",
  "400": "A",
  "401": "A",
  "402": "A",
  "403": "A",
  "405": "A",
  "700": "C",
  "701": "C",
  "702": "C",
  "704": "C",
  "705": "C",
  "712": "C",
  "715": "C",
  "800": "C",
  "900": "B",
  "901": "B",
  "902": "B",
  "903": "B",
  "904": "B",
  "905": "B",
  "906": "B",
  "1000": "C",
  "1300": "C",
  "1400": "B",
};

const OEV_CATEGORIES_STANDARD_120: StationConfig["categories"] = [
  { A: 1, B: 1, C: 2 },
  { A: 1, B: 2, C: 3 },
  { A: 2, B: 3, C: 4 },
  { A: 3, B: 4, C: 5 },
  { A: 4, B: 5, C: 6 },
  { A: 5, B: 6, C: 7 },
];

const OEV_CLASSIFICATION_STANDARD_120: StationConfig["classification"] = {
  "1": { 300: "1", 500: "1", 750: "2", 1000: "3" },
  "2": { 300: "1", 500: "2", 750: "3", 1000: "4" },
  "3": { 300: "2", 500: "3", 750: "4", 1000: "5" },
  "4": { 300: "3", 500: "4", 750: "5", 1000: "6" },
  "5": { 300: "4", 500: "5", 750: "6" },
  "6": { 300: "5", 500: "6" },
  "7": { 300: "6" },
};

const OEV_PRESET_TIME_FREQUENCY: Record<OevConfigPresetKey, number[]> = {
  compact_60: [5, 10, 20, 40, 60],
  standard_120: [5, 10, 20, 40, 60, 120],
  extended_210: [5, 10, 20, 40, 60, 120, 210],
};

const OEV_CATEGORIES_BY_PRESET: Record<OevConfigPresetKey, StationConfig["categories"]> = {
  compact_60: OEV_CATEGORIES_STANDARD_120.slice(0, 5),
  standard_120: OEV_CATEGORIES_STANDARD_120,
  extended_210: [...OEV_CATEGORIES_STANDARD_120, { A: 6, B: 7, C: 8 }],
};

const OEV_CLASSIFICATION_BY_PRESET: Record<OevConfigPresetKey, StationConfig["classification"]> = {
  compact_60: {
    "1": { 300: "1", 500: "1", 750: "2", 1000: "3" },
    "2": { 300: "1", 500: "2", 750: "3", 1000: "4" },
    "3": { 300: "2", 500: "3", 750: "4", 1000: "5" },
    "4": { 300: "3", 500: "4", 750: "5"},
    "5": { 300: "4", 500: "5"},
    "6": { 300: "5"},
  },
  standard_120: OEV_CLASSIFICATION_STANDARD_120,
  extended_210: {
    "1": { 300: "1", 500: "1", 750: "2", 1000: "3", 1250: "4" },
    "2": { 300: "1", 500: "2", 750: "3", 1000: "4", 1250: "5" },
    "3": { 300: "2", 500: "3", 750: "4", 1000: "5", 1250: "6" },
    "4": { 300: "3", 500: "4", 750: "5", 1000: "6", 1250: "7" },
    "5": { 300: "4", 500: "5", 750: "6", 1000: "7" },
    "6": { 300: "5", 500: "6", 750: "7" },
    "7": { 300: "6", 500: "7" },
    "8": { 300: "7" },
  },
};

const cloneStationConfig = (config: StationConfig): StationConfig => {
  return {
    groups: { ...config.groups },
    time_frequency: [...config.time_frequency],
    categories: config.categories.map((row) => ({ ...row })),
    classification: Object.fromEntries(
      Object.entries(config.classification).map(([category, distances]) => [
        category,
        Object.fromEntries(Object.entries(distances)),
      ])
    ),
  };
};

export const getOevStationConfigPreset = (
  preset: OevConfigPresetKey = "standard_120"
): StationConfig => {
  const config: StationConfig = {
    groups: OEV_STATION_GROUPS_DEFAULT,
    time_frequency: OEV_PRESET_TIME_FREQUENCY[preset],
    categories: OEV_CATEGORIES_BY_PRESET[preset],
    classification: OEV_CLASSIFICATION_BY_PRESET[preset],
  };

  return cloneStationConfig(config);
};

export const OEV_STATION_CONFIG_DEFAULT = getOevStationConfigPreset("standard_120");
