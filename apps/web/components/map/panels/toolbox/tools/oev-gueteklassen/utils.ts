import type { PostOevGueteKlassen } from "@/lib/validations/tools";

export type OevStationConfig = PostOevGueteKlassen["station_config"];

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export const getFrequencyInputValue = (config: OevStationConfig): string => {
  return config.time_frequency.join(", ");
};

export const parseFrequencyInput = (value: string): number[] => {
  return value
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item));
};

export const classNumberToLabel = (value: number): string => {
  if (!Number.isInteger(value) || value <= 0) {
    return "";
  }

  let remaining = value;
  let label = "";
  while (remaining > 0) {
    const charIndex = (remaining - 1) % 26;
    label = `${ALPHABET[charIndex]}${label}`;
    remaining = Math.floor((remaining - 1) / 26);
  }

  return label;
};

export const classLabelToNumber = (value: string): number | undefined => {
  const normalized = value.trim().toUpperCase();
  if (!normalized) {
    return undefined;
  }

  if (/^\d+$/.test(normalized)) {
    const numeric = Number(normalized);
    return Number.isInteger(numeric) && numeric > 0 ? numeric : undefined;
  }

  if (!/^[A-Z]+$/.test(normalized)) {
    return undefined;
  }

  let total = 0;
  for (const char of normalized) {
    total = total * 26 + (char.charCodeAt(0) - 64);
  }
  return total > 0 ? total : undefined;
};

export const computeDefaultClassForCell = (categoryId: string, distanceIndex: number): string => {
  const category = Number(categoryId);
  if (!Number.isInteger(category) || category <= 0) {
    return "1";
  }

  if (category === 1 && distanceIndex === 1) {
    return "1";
  }

  return String(Math.max(1, category + distanceIndex - 1));
};

export const getIntervalLabels = (frequencies: number[]): string[] => {
  return frequencies.map((threshold, index) => {
    if (index === 0) {
      return `<= ${threshold} Minuten`;
    }
    const previous = frequencies[index - 1];
    return `> ${previous} bis <= ${threshold} Minuten`;
  });
};

const nextCategoryRow = (lastRow: { A?: number; B?: number; C?: number } | undefined) => {
  const baseA = lastRow?.A ?? 1;
  const baseB = lastRow?.B ?? 1;
  const baseC = lastRow?.C ?? 2;
  return {
    A: baseA + 1,
    B: baseB + 1,
    C: baseC + 1,
  };
};

export const withFrequencies = (config: OevStationConfig, frequencies: number[]): OevStationConfig => {
  if (!frequencies.length) {
    return {
      ...config,
      time_frequency: [],
      categories: [],
    };
  }

  const categories = [...config.categories];
  if (categories.length > frequencies.length) {
    categories.splice(frequencies.length);
  }

  while (categories.length < frequencies.length) {
    categories.push(nextCategoryRow(categories[categories.length - 1]));
  }

  const nextConfig: OevStationConfig = {
    ...config,
    time_frequency: frequencies,
    categories,
  };

  return ensureClassificationCoverage(nextConfig);
};

export const updateCategoryCell = (
  config: OevStationConfig,
  rowIndex: number,
  group: "A" | "B" | "C",
  value: number
): OevStationConfig => {
  const categories = config.categories.map((row, index) => {
    if (index !== rowIndex) return row;
    return {
      ...row,
      [group]: value,
    };
  });

  return ensureClassificationCoverage({
    ...config,
    categories,
  });
};

export const getCategoryIds = (config: OevStationConfig): string[] => {
  const used = new Set<number>();
  config.categories.forEach((row) => {
    [row.A, row.B, row.C].forEach((category) => {
      if (typeof category === "number") {
        used.add(category);
      }
    });
  });

  return [...used].sort((a, b) => a - b).map(String);
};

export const getDistanceKeys = (config: OevStationConfig): number[] => {
  const keys = new Set<number>();
  Object.values(config.classification).forEach((row) => {
    Object.keys(row).forEach((distance) => {
      const parsed = Number(distance);
      if (Number.isFinite(parsed)) {
        keys.add(parsed);
      }
    });
  });

  return [...keys].sort((a, b) => a - b);
};

export const updateClassificationCell = (
  config: OevStationConfig,
  categoryId: string,
  distance: number,
  ptClass: string
): OevStationConfig => {
  const existingRow = config.classification[categoryId] ?? {};
  const nextRow = {
    ...existingRow,
    [distance]: ptClass,
  };

  return {
    ...config,
    classification: {
      ...config.classification,
      [categoryId]: nextRow,
    },
  };
};

export const ensureClassificationCoverage = (config: OevStationConfig): OevStationConfig => {
  const categoryIds = getCategoryIds(config);
  const distances = getDistanceKeys(config);
  const fallbackDistances = distances.length ? distances : [300];
  const totalCategories = categoryIds.length;

  const classification: OevStationConfig["classification"] = {};
  categoryIds.forEach((categoryId, categoryIndex) => {
    const row = { ...(config.classification[categoryId] ?? {}) };
    const filledDistanceCount = Math.max(
      1,
      Math.min(fallbackDistances.length, totalCategories - categoryIndex)
    );

    fallbackDistances.forEach((distance, distanceIndex) => {
      if (distanceIndex < filledDistanceCount) {
        if (row[distance] === undefined) {
          row[distance] = computeDefaultClassForCell(categoryId, distanceIndex);
        }
        return;
      }

      delete row[distance];
    });

    classification[categoryId] = row;
  });

  return {
    ...config,
    classification,
  };
};
